using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;
using Object = UnityEngine.Object;

namespace WildStat.ArtTools
{
    // Optional command-line entry point. Import the trusted package with Unity's
    // -importPackage option first; this method never downloads or imports art itself.
    public static class SpriteExportBatch
    {
        [Serializable] public class LastExport { public string directory; public string prefab; }

        public static SpriteExportSettings SettingsFor(GameObject prefab)
        {
            if (!prefab) throw new ArgumentException("The selected prefab could not be loaded.");
            var animators = prefab.GetComponentsInChildren<Animator>(true);
            var legacy = prefab.GetComponentsInChildren<Animation>(true);
            if (animators.Length > 1) throw new ArgumentException("Multiple Animators: choose the animation root manually in the exporter window.");
            Transform root = animators.Length == 1 ? animators[0].transform : legacy.Length == 1 ? legacy[0].transform : prefab.transform;
            var clips = AnimationUtility.GetAnimationClips(root.gameObject).Where(clip => clip).Distinct().OrderBy(clip => clip.name).ToArray();
            var settings = new SpriteExportSettings { prefab = prefab, name = prefab.name, animationRoot = AnimationUtility.CalculateTransformPath(root, prefab.transform) };
            foreach (string key in SpriteMotions.CoreKeys)
            {
                var tokens = key == "walk" ? new[] { "walk", "run" } : new[] { key };
                var clip = clips.FirstOrDefault(candidate => tokens.Any(token => candidate.name.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0));
                settings.clips.Add(new ClipChoice(key, clip, key == "idle" || key == "walk"));
            }
            return settings;
        }

        public static void Remember(string directory, GameObject prefab)
        {
            var record = new LastExport { directory = directory, prefab = AssetDatabase.GetAssetPath(prefab) };
            File.WriteAllText(Path.Combine(Directory.GetParent(Application.dataPath).FullName, "wildstat-last-export.json"), JsonUtility.ToJson(record, true));
        }

        public static void Run()
        {
            try
            {
                string[] args = Environment.GetCommandLineArgs();
                int index = Array.IndexOf(args, "-wildstatSpritePrefab");
                if (index < 0 || index + 1 >= args.Length) throw new ArgumentException("Pass -wildstatSpritePrefab followed by an Assets/... prefab path.");
                string path = args[index + 1];
                if (!path.StartsWith("Assets/", StringComparison.Ordinal) || !path.EndsWith(".prefab", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Expected a prefab inside this Unity project's Assets folder.");
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                var settings = SettingsFor(prefab);
                if (settings.clips.Any(choice => !choice.clip)) throw new InvalidOperationException("Could not match idle, walk and attack automatically. Use the exporter window to assign them.");
                VerifyCaptureBasics();
                var directory = SpriteExporter.Export(settings, SpriteExporter.DefaultExportRoot(), Path.Combine(Application.dataPath, "WildStatSpriteExporter/Viewer"), false);
                VerifyPixels(directory);
                Remember(directory, prefab);
                Debug.Log("WILDSTAT_EXPORT_SUCCESS " + directory);
                EditorApplication.Exit(0);
            }
            catch (Exception error) { Debug.LogException(error); EditorApplication.Exit(1); }
        }

        private static void VerifyCaptureBasics()
        {
            var source = new GameObject("Exporter synthetic check");
            var texture = new Texture2D(32, 32, TextureFormat.RGBA32, false);
            Sprite sprite = null;
            Material material = null;
            var clip = new AnimationClip();
            try
            {
                source.transform.position = new Vector3(19, -7, 0);
                var pixels = new Color32[32 * 32];
                for (int y = 0; y < 32; y++)
                    for (int x = 0; x < 32; x++) pixels[y * 32 + x] = y < 16 ? new Color32(0, 0, 255, 128) : new Color32(255, 0, 0, 255);
                texture.SetPixels32(pixels); texture.Apply();
                sprite = Sprite.Create(texture, new Rect(0, 0, 32, 32), new Vector2(.5f, .5f), 32);
                var body = new GameObject("Body"); body.transform.SetParent(source.transform, false); body.transform.localPosition = new Vector3(0, .5f, 0);
                var renderer = body.AddComponent<SpriteRenderer>(); renderer.sprite = sprite;
                material = new Material(Shader.Find("Sprites/Default")); renderer.sharedMaterial = material;
                AnimationUtility.SetEditorCurve(clip, EditorCurveBinding.FloatCurve("Body", typeof(Transform), "m_LocalPosition.x"), AnimationCurve.Linear(0, -.25f, 1, .25f));
                var settings = new SpriteExportSettings { prefab = source, name = "capture-check", frameSize = 64, fps = 4 };
                settings.clips.Add(new ClipChoice("idle", clip, true));
                string output = SpriteExporter.Export(settings, Path.Combine(Directory.GetParent(Application.dataPath).FullName, "Temp/WildStatCaptureChecks"), Path.Combine(Application.dataPath, "WildStatSpriteExporter/Viewer"), false);
                var manifest = JsonUtility.FromJson<SpriteManifest>(File.ReadAllText(Path.Combine(output, "sprite.json")));
                var sheet = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                try
                {
                    sheet.LoadImage(File.ReadAllBytes(Path.Combine(output, manifest.pages[0].file)));
                    var frame = manifest.animations[0].frames[0];
                    var colors = sheet.GetPixels(frame.x, sheet.height - frame.y - frame.h, frame.w, frame.h);
                    int red = 0, blue = 0, clear = 0; double redY = 0, blueY = 0;
                    for (int i = 0; i < colors.Length; i++)
                    {
                        Color32 color = colors[i];
                        if (color.a == 0) clear++;
                        if (color.r >= 253 && color.a == 255) { red++; redY += i / frame.w; }
                        if (color.b >= 253 && color.a >= 127 && color.a <= 129) { blue++; blueY += i / frame.w; }
                    }
                    if (red == 0 || blue == 0 || clear == 0) throw new Exception("Capture alpha/color check failed: expected opaque red, straight-alpha half-blue, and transparent background.");
                    if (redY / red <= blueY / blue) throw new Exception("Capture orientation check failed: top and bottom colors are inverted.");
                    if (source.transform.position != new Vector3(19, -7, 0)) throw new Exception("Source prefab position was changed by capture.");
                    VerifyPixels(output);
                    Debug.Log("WILDSTAT_CAPTURE_CHECK_PASS alpha, colors, orientation, animation, source preservation");
                }
                finally { Object.DestroyImmediate(sheet); }
            }
            finally
            {
                Object.DestroyImmediate(source); Object.DestroyImmediate(clip);
                if (sprite) Object.DestroyImmediate(sprite);
                if (material) Object.DestroyImmediate(material);
                Object.DestroyImmediate(texture);
            }
        }

        public static void VerifyPixels(string directory)
        {
            var manifest = JsonUtility.FromJson<SpriteManifest>(File.ReadAllText(Path.Combine(directory, "sprite.json")));
            var textures = manifest.pages.Select(page => {
                var texture = new Texture2D(2, 2, TextureFormat.RGBA32, false);
                if (!texture.LoadImage(File.ReadAllBytes(Path.Combine(directory, page.file)))) throw new Exception("PNG could not be decoded.");
                if (texture.width != page.width || texture.height != page.height) throw new Exception("PNG dimensions do not match metadata.");
                return texture;
            }).ToArray();
            try
            {
                foreach (var animation in manifest.animations)
                {
                    var hashes = animation.frames.Select(frame => {
                        var texture = textures[frame.page];
                        var colors = texture.GetPixels(frame.x, texture.height - frame.y - frame.h, frame.w, frame.h);
                        var bytes = new byte[colors.Length * 4];
                        for (int i = 0; i < colors.Length; i++) {
                            Color32 color = colors[i]; bytes[i * 4] = color.r; bytes[i * 4 + 1] = color.g; bytes[i * 4 + 2] = color.b; bytes[i * 4 + 3] = color.a;
                        }
                        using (var sha = SHA256.Create()) return Convert.ToBase64String(sha.ComputeHash(bytes));
                    }).Distinct().Count();
                    Debug.Log("WILDSTAT_PIXEL_CHECK " + animation.key + " frames=" + animation.frames.Count + " distinct=" + hashes);
                    if (animation.frames.Count > 1 && hashes == 1) throw new Exception(animation.key + " is static across all sampled frames. Verify the clip/root mapping before using it.");
                }
                foreach (var texture in textures)
                {
                    if (texture.width > 2048 || texture.height > 2048) throw new Exception("Sheet exceeds texture budget.");
                    if (texture.GetPixel(0, 0).a != 0) throw new Exception("Sheet gutter is not transparent.");
                }
            }
            finally { foreach (var texture in textures) Object.DestroyImmediate(texture); }
        }
    }
}
