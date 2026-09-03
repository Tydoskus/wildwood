using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using Object = UnityEngine.Object;

namespace WildStat.ArtTools
{
    [Serializable] public class ClipChoice
    {
        public string key;
        public AnimationClip clip;
        public bool loop;
        public ClipChoice(string key, AnimationClip clip = null, bool loop = false) { this.key = key; this.clip = clip; this.loop = loop; }
    }
    [Serializable] public class SpriteExportSettings
    {
        public GameObject prefab;
        public string name = "monster";
        public string animationRoot = "";
        public int frameSize = 256;
        public int fps = 12;
        public float padding = .08f;
        public Vector2 groundPoint = Vector2.zero;
        public bool lockRootPosition = true;
        public bool unpremultiply = true;
        public List<ClipChoice> clips = new List<ClipChoice>();
    }
    [Serializable] public class SpriteManifest
    {
        public int schemaVersion = 1;
        public string name;
        public int frameWidth, frameHeight;
        public float anchorX, anchorY, pixelsPerUnit;
        public string coordinates = "top-left-pixels";
        public string alpha = "straight";
        public string sourceAlpha = "premultiplied";
        public List<SheetPage> pages = new List<SheetPage>();
        public List<ClipManifest> animations = new List<ClipManifest>();
        public List<string> warnings = new List<string>();
    }
    [Serializable] public class SheetPage { public string file; public int width, height; }
    [Serializable] public class SpriteFrame { public int page, x, y, w, h; }
    [Serializable] public class ClipManifest
    {
        public string key, sourceClip;
        public bool loop;
        public double durationMs, frameDurationMs;
        public List<SpriteFrame> frames = new List<SpriteFrame>();
    }

    public static class SpriteExporter
    {
        public static string DefaultExportRoot()
        {
            string project = Directory.GetParent(Application.dataPath).FullName;
            string config = Path.Combine(project, "wildstat-exporter.json");
            if (File.Exists(config))
            {
                var settings = JsonUtility.FromJson<ProjectPaths>(File.ReadAllText(config));
                if (!string.IsNullOrEmpty(settings.exportRoot)) return Path.GetFullPath(settings.exportRoot);
            }
            return Path.Combine(project, "WildStatExports");
        }

        [Serializable] private class ProjectPaths { public string exportRoot = ""; }

        public static void Validate(SpriteExportSettings settings)
        {
            if (!settings.prefab) throw new ArgumentException("Select a character prefab first.");
            if (GraphicsSettings.currentRenderPipeline != null)
                throw new InvalidOperationException("Use a Built-in render pipeline project for this exporter (not URP/HDRP).");
            if (EditorApplication.isPlayingOrWillChangePlaymode) throw new InvalidOperationException("Exit Play mode before exporting.");
            SpriteMath.SafeName(settings.name);
            SpriteMath.Layout(settings.frameSize, 1);
            if (settings.padding < 0 || settings.padding > .4f) throw new ArgumentException("Padding must be between 0% and 40%.");
            var keys = new HashSet<string>();
            var choices = settings.clips.Where(choice => choice.clip).ToArray();
            if (choices.Length == 0) throw new ArgumentException("Assign at least one animation clip.");
            int total = 0;
            foreach (var choice in choices)
            {
                if (!keys.Add(SpriteMath.SafeName(choice.key))) throw new ArgumentException("Animation names must be unique.");
                if (choice.clip.humanMotion) throw new NotSupportedException("Humanoid/3D animation is not supported by this 2D exporter.");
                total += SpriteMath.FrameCount(choice.clip.length, settings.fps);
            }
            if (total > 2000) throw new ArgumentException("Export is over 2,000 frames. Reduce the FPS or export fewer clips.");
            if (settings.prefab.GetComponentsInChildren<Renderer>(true).Any(renderer => !(renderer is SpriteRenderer)))
                throw new NotSupportedException("This first version captures SpriteRenderer characters, not meshes, particles, or trails.");
            foreach (var component in settings.prefab.GetComponentsInChildren<MonoBehaviour>(true))
            {
                if (!component) throw new InvalidOperationException("The prefab has missing scripts. Install its required packages before exporting.");
                if (component.GetType().FullName == "UnityEngine.U2D.Animation.SpriteSkin")
                    throw new NotSupportedException("This prefab uses SpriteSkin deformation. It needs a rig-aware bake adapter; exporting it as simple transform animation would be incorrect.");
            }
        }

        public static string Export(SpriteExportSettings settings, string outputRoot, string viewerSource, bool interactive = true)
        {
            Validate(settings);
            var choices = settings.clips.Where(choice => choice.clip).ToArray();
            var scene = EditorSceneManager.NewPreviewScene();
            Camera camera = null;
            RenderTexture target = null;
            Texture2D frameTexture = null;
            string staging = null;
            int total = choices.Sum(choice => SpriteMath.FrameCount(choice.clip.length, settings.fps)) * 2;
            int completed = 0;
            try
            {
                bool foundBounds = false;
                Bounds bounds = new Bounds();
                foreach (var choice in choices)
                {
                    GameObject clone = CreateClone(settings, scene);
                    try
                    {
                        int count = SpriteMath.FrameCount(choice.clip.length, settings.fps);
                        for (int index = 0; index < count; index++)
                        {
                            Progress("Measure " + choice.key, completed++, total, interactive);
                            Sample(clone, settings, choice, index, count);
                            foreach (var renderer in clone.GetComponentsInChildren<SpriteRenderer>())
                            {
                                if (!renderer.enabled || !renderer.sprite) continue;
                                if (!foundBounds) { bounds = renderer.bounds; foundBounds = true; }
                                else bounds.Encapsulate(renderer.bounds);
                            }
                        }
                    }
                    finally { Object.DestroyImmediate(clone); }
                }
                if (!foundBounds) throw new InvalidOperationException("No visible sprites were found. Check the prefab and animation root.");
                var square = SpriteMath.Fit(bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y,
                    settings.groundPoint.x, settings.groundPoint.y, settings.padding);
                var manifest = new SpriteManifest {
                    name = SpriteMath.SafeName(settings.name), frameWidth = settings.frameSize, frameHeight = settings.frameSize,
                    sourceAlpha = settings.unpremultiply ? "premultiplied" : "straight",
                    pixelsPerUnit = (float)(settings.frameSize / square.size),
                    anchorX = (float)((settings.groundPoint.x - square.x) / square.size * settings.frameSize),
                    anchorY = (float)((square.y + square.size - settings.groundPoint.y) / square.size * settings.frameSize)
                };
                var cameraObject = new GameObject("WildStat export camera");
                SceneManager.MoveGameObjectToScene(cameraObject, scene);
                camera = cameraObject.AddComponent<Camera>();
                camera.enabled = false;
                camera.scene = scene;
                camera.orthographic = true;
                camera.orthographicSize = (float)square.size / 2;
                camera.aspect = 1;
                camera.transform.position = new Vector3((float)(square.x + square.size / 2), (float)(square.y + square.size / 2), bounds.min.z - 10);
                camera.nearClipPlane = .01f;
                camera.farClipPlane = Math.Max(100, bounds.size.z + 20);
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = Color.clear;
                camera.allowHDR = false;
                camera.allowMSAA = false;
                camera.useOcclusionCulling = false;
                target = new RenderTexture(settings.frameSize, settings.frameSize, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
                target.antiAliasing = 1;
                target.Create();
                camera.targetTexture = target;
                frameTexture = new Texture2D(settings.frameSize, settings.frameSize, TextureFormat.RGBA32, false, false);

                Directory.CreateDirectory(outputRoot);
                string suffix = DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6);
                string destination = Path.Combine(outputRoot, manifest.name + "-" + suffix);
                staging = Path.Combine(outputRoot, ".incomplete-" + manifest.name + "-" + suffix);
                Directory.CreateDirectory(staging);
                File.WriteAllText(Path.Combine(staging, "INCOMPLETE.txt"), "This export did not finish. Do not import it into the game.\n");

                foreach (var choice in choices)
                {
                    int count = SpriteMath.FrameCount(choice.clip.length, settings.fps);
                    var animation = new ClipManifest {
                        key = SpriteMath.SafeName(choice.key), sourceClip = choice.clip.name, loop = choice.loop,
                        frameDurationMs = SpriteMath.FrameDurationMs(count, choice.clip.length, settings.fps)
                    };
                    animation.durationMs = animation.frameDurationMs * count;
                    manifest.animations.Add(animation);
                    GameObject clone = CreateClone(settings, scene);
                    Texture2D atlas = null;
                    bool anyVisiblePixel = false;
                    bool clipped = false;
                    try
                    {
                        var unsupported = clone.GetComponentsInChildren<SpriteRenderer>(true)
                            .Any(renderer => renderer.sharedMaterial && renderer.sharedMaterial.shader.name != "Sprites/Default");
                        if (unsupported && !manifest.warnings.Contains("Custom sprite materials: verify transparency and colors against Unity."))
                            manifest.warnings.Add("Custom sprite materials: verify transparency and colors against Unity.");
                        int pageNumber = 0;
                        for (int start = 0; start < count; )
                        {
                            var layout = SpriteMath.Layout(settings.frameSize, count - start);
                            int pageCount = Math.Min(layout.capacity, count - start);
                            atlas = new Texture2D(layout.width, layout.height, TextureFormat.RGBA32, false, false);
                            atlas.SetPixels32(new Color32[layout.width * layout.height]);
                            int page = manifest.pages.Count;
                            string filename = animation.key + "-" + pageNumber++ + ".png";
                            manifest.pages.Add(new SheetPage { file = filename, width = layout.width, height = layout.height });
                            for (int local = 0; local < pageCount; local++)
                            {
                                Progress("Capture " + choice.key, completed++, total, interactive);
                                Sample(clone, settings, choice, start + local, count);
                                var pixels = Capture(camera, target, frameTexture, settings.unpremultiply);
                                anyVisiblePixel |= pixels.Any(pixel => pixel.a != 0);
                                int side = settings.frameSize;
                                for (int edge = 0; edge < side; edge++)
                                    clipped |= pixels[edge].a > 0 || pixels[(side - 1) * side + edge].a > 0 || pixels[edge * side].a > 0 || pixels[edge * side + side - 1].a > 0;
                                int x = (local % layout.columns) * layout.cell + SpriteMath.Gutter;
                                int y = (local / layout.columns) * layout.cell + SpriteMath.Gutter;
                                // Unity pixel arrays start at bottom-left; JSON rectangles use browser top-left.
                                atlas.SetPixels32(x, layout.height - y - side, side, side, pixels);
                                animation.frames.Add(new SpriteFrame { page = page, x = x, y = y, w = side, h = side });
                            }
                            atlas.Apply(false, false);
                            File.WriteAllBytes(Path.Combine(staging, filename), atlas.EncodeToPNG());
                            Object.DestroyImmediate(atlas); atlas = null;
                            start += pageCount;
                        }
                        if (!anyVisiblePixel) throw new InvalidOperationException(choice.key + " rendered entirely transparent. Check animation root, materials, and sprite layers.");
                        if (clipped) manifest.warnings.Add(choice.key + ": visible pixels touch the frame edge; increase padding or inspect effects.");
                    }
                    finally { if (atlas) Object.DestroyImmediate(atlas); Object.DestroyImmediate(clone); }
                }
                foreach (string file in new[] { "index.html", "viewer.js", "viewer-core.js" })
                    File.Copy(Path.Combine(viewerSource, file), Path.Combine(staging, file));
                File.WriteAllText(Path.Combine(staging, "sprite.json"), JsonUtility.ToJson(manifest, true));
                File.Delete(Path.Combine(staging, "INCOMPLETE.txt"));
                Directory.Move(staging, destination);
                staging = null;
                return destination;
            }
            catch (Exception error)
            {
                if (staging != null) File.WriteAllText(Path.Combine(staging, "INCOMPLETE.txt"), "Export incomplete: " + error.Message + "\nDo not import this folder into the game.\n");
                throw;
            }
            finally
            {
                if (camera) camera.targetTexture = null;
                if (target) { target.Release(); Object.DestroyImmediate(target); }
                if (frameTexture) Object.DestroyImmediate(frameTexture);
                EditorSceneManager.ClosePreviewScene(scene);
                if (interactive) EditorUtility.ClearProgressBar();
            }
        }

        private static GameObject CreateClone(SpriteExportSettings settings, Scene scene)
        {
            var clone = Object.Instantiate(settings.prefab);
            SceneManager.MoveGameObjectToScene(clone, scene);
            clone.transform.position = Vector3.zero;
            clone.SetActive(true);
            foreach (var animator in clone.GetComponentsInChildren<Animator>(true)) { animator.enabled = false; animator.fireEvents = false; }
            foreach (var animation in clone.GetComponentsInChildren<Animation>(true)) animation.enabled = false;
            // This sampler deliberately does not run gameplay behaviours or physics.
            foreach (var script in clone.GetComponentsInChildren<MonoBehaviour>(true)) if (script) script.enabled = false;
            foreach (var body in clone.GetComponentsInChildren<Rigidbody2D>(true)) body.simulated = false;
            return clone;
        }

        private static void Sample(GameObject clone, SpriteExportSettings settings, ClipChoice choice, int index, int count)
        {
            Transform root = string.IsNullOrWhiteSpace(settings.animationRoot) ? clone.transform : clone.transform.Find(settings.animationRoot);
            if (!root) throw new ArgumentException("Animation root path was not found in the prefab.");
            Vector3 rootPosition = root.localPosition;
            choice.clip.SampleAnimation(root.gameObject, (float)SpriteMath.SampleTime(index, count, choice.clip.length, choice.loop));
            if (settings.lockRootPosition) { root.localPosition = rootPosition; clone.transform.position = Vector3.zero; }
        }

        private static Color32[] Capture(Camera camera, RenderTexture target, Texture2D texture, bool unpremultiply)
        {
            var previous = RenderTexture.active;
            try
            {
                camera.Render();
                RenderTexture.active = target;
                texture.ReadPixels(new Rect(0, 0, target.width, target.height), 0, 0, false);
                texture.Apply(false, false);
                var pixels = texture.GetPixels32();
                if (unpremultiply)
                    for (int i = 0; i < pixels.Length; i++)
                    {
                        var p = pixels[i];
                        bool linear = QualitySettings.activeColorSpace == ColorSpace.Linear;
                        pixels[i] = new Color32(SpriteMath.StraightChannel(p.r, p.a, linear), SpriteMath.StraightChannel(p.g, p.a, linear), SpriteMath.StraightChannel(p.b, p.a, linear), p.a);
                    }
                return pixels;
            }
            finally { RenderTexture.active = previous; }
        }

        private static void Progress(string stage, int completed, int total, bool interactive)
        {
            if (interactive && EditorUtility.DisplayCancelableProgressBar("WildStat Sprite Exporter", stage, (float)completed / total))
                throw new OperationCanceledException("Export cancelled. Previous exports are untouched.");
        }
    }
}
