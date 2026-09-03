using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace WildStat.ArtTools
{
    public sealed class SpriteExporterWindow : EditorWindow
    {
        [SerializeField] private SpriteExportSettings settings = new SpriteExportSettings();
        [SerializeField] private string lastExport = "";
        [SerializeField] private bool advanced;
        [SerializeField] private bool coreMotionDefaultsApplied;
        private Vector2 scroll;
        private string status = "";
        private MessageType statusType = MessageType.Info;
        private static double nextRequestCheck;
        private static readonly int[] Sizes = { 64, 128, 256, 512 };
        private static readonly string[] SizeLabels = { "64 px", "128 px", "256 px", "512 px" };

        [MenuItem("WildStat/Sprite Exporter")]
        public static void Open()
        {
            var window = GetWindow<SpriteExporterWindow>("WildStat Sprites");
            window.minSize = new Vector2(440, 540);
            window.Show();
        }

        [InitializeOnLoadMethod]
        private static void InstallOpenRequestHandler()
        {
            EditorApplication.update -= CheckOpenRequest;
            EditorApplication.update += CheckOpenRequest;
        }

        private static void CheckOpenRequest()
        {
            if (Application.isBatchMode) return;
            if (EditorApplication.timeSinceStartup < nextRequestCheck || EditorApplication.isCompiling || EditorApplication.isUpdating) return;
            nextRequestCheck = EditorApplication.timeSinceStartup + 2;
            string request = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "WildStatOpenExporter.request");
            if (!File.Exists(request)) return;
            File.Delete(request);
            Open();
        }

        private void OnEnable()
        {
            if (settings == null) settings = new SpriteExportSettings();
            if (settings.clips.Count == 0) ResetClips();
            if (!coreMotionDefaultsApplied)
            {
                // Migrate the previously open five-motion window once. Future
                // deliberately added extra motions are not removed on reload.
                settings.clips.RemoveAll(choice => SpriteMotions.UsesGameEffect(choice.key));
                coreMotionDefaultsApplied = true;
            }
            string previous = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "wildstat-last-export.json");
            if (File.Exists(previous))
            {
                try {
                    var record = JsonUtility.FromJson<SpriteExportBatch.LastExport>(File.ReadAllText(previous));
                    var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(record.prefab);
                    if (!settings.prefab && prefab) settings = SpriteExportBatch.SettingsFor(prefab);
                    if (prefab == settings.prefab && Directory.Exists(record.directory)) lastExport = record.directory;
                }
                catch (Exception error) { status = "Could not restore the last selection: " + error.Message; }
            }
        }

        private void ResetClips()
        {
            settings.clips = SpriteMotions.CoreKeys.Select(key => new ClipChoice(key, null, key != "attack")).ToList();
        }

        private void OnGUI()
        {
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.LabelField("Unity → WildStat sprite sheets", EditorStyles.boldLabel);
            EditorGUILayout.HelpBox("Local art preparation only. Exports do not change or release the live game.", MessageType.Info);
            if (GUILayout.Button("1. Import a trusted .unitypackage…", GUILayout.Height(28)))
            {
                string path = EditorUtility.OpenFilePanel("Choose your licensed Unity package", "", "unitypackage");
                if (!string.IsNullOrEmpty(path)) AssetDatabase.ImportPackage(path, true);
            }
            EditorGUILayout.Space(10);
            EditorGUI.BeginChangeCheck();
            var prefab = (GameObject)EditorGUILayout.ObjectField("2. Character prefab", settings.prefab, typeof(GameObject), false);
            if (EditorGUI.EndChangeCheck())
            {
                settings.prefab = prefab;
                if (prefab) { settings.name = prefab.name; FindClips(); }
            }
            settings.name = EditorGUILayout.TextField("Export name", settings.name);
            using (new EditorGUI.DisabledScope(!settings.prefab))
                if (GUILayout.Button("Find this character's animations")) FindClips();
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("3. Animations", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("Idle, walk and attack. Hit and death effects stay in the game.", EditorStyles.wordWrappedMiniLabel);
            for (int i = 0; i < settings.clips.Count; i++)
            {
                var choice = settings.clips[i];
                EditorGUILayout.BeginHorizontal();
                choice.key = EditorGUILayout.TextField(choice.key, GUILayout.Width(65));
                choice.clip = (AnimationClip)EditorGUILayout.ObjectField(choice.clip, typeof(AnimationClip), false);
                choice.loop = GUILayout.Toggle(choice.loop, "Loop", GUILayout.Width(50));
                if (i >= SpriteMotions.CoreKeys.Count && GUILayout.Button("×", GUILayout.Width(22))) { settings.clips.RemoveAt(i); i--; }
                EditorGUILayout.EndHorizontal();
            }
            if (GUILayout.Button("Add another motion")) settings.clips.Add(new ClipChoice("motion-" + (settings.clips.Count + 1)));
            EditorGUILayout.Space(10);
            EditorGUILayout.LabelField("4. Export quality", EditorStyles.boldLabel);
            settings.frameSize = EditorGUILayout.IntPopup("Frame size", settings.frameSize, SizeLabels, Sizes);
            settings.fps = EditorGUILayout.IntSlider("Frames per second", settings.fps, 1, 30);
            advanced = EditorGUILayout.Foldout(advanced, "Alignment and material options", true);
            if (advanced)
            {
                settings.animationRoot = EditorGUILayout.TextField(new GUIContent("Animation root", "Relative child path containing the Animator. Empty means the prefab root."), settings.animationRoot);
                settings.padding = EditorGUILayout.Slider("Padding per edge", settings.padding, .02f, .3f);
                settings.groundPoint = EditorGUILayout.Vector2Field("Foot point (Unity units)", settings.groundPoint);
                settings.lockRootPosition = EditorGUILayout.Toggle("Keep root in place", settings.lockRootPosition);
                settings.unpremultiply = EditorGUILayout.Toggle(new GUIContent("Premultiplied material", "On for Sprites/Default. Turn off only if the custom material already outputs straight-alpha RGB. The exported PNG is always intended to be straight-alpha."), settings.unpremultiply);
            }
            EditorGUILayout.HelpBox("First version: Built-in pipeline + SpriteRenderer/transform or sprite-swap clips. Script-driven effects, SpriteSkin rigs, meshes and particles need separate support.", MessageType.None);
            if (GUILayout.Button("Export this character", GUILayout.Height(34))) Export();
            if (!string.IsNullOrEmpty(status)) EditorGUILayout.HelpBox(status, statusType);
            if (!string.IsNullOrEmpty(lastExport) && Directory.Exists(lastExport))
            {
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("Open export folder")) EditorUtility.RevealInFinder(Path.Combine(lastExport, "sprite.json"));
                if (GUILayout.Button("Preview / make WebP")) Application.OpenURL(new Uri(Path.Combine(lastExport, "index.html")).AbsoluteUri);
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.LabelField("In the preview, choose this export folder. Files stay on your computer.", EditorStyles.wordWrappedMiniLabel);
            }
            EditorGUILayout.EndScrollView();
        }

        private void FindClips()
        {
            if (!settings.prefab) return;
            ResetClips();
            var animators = settings.prefab.GetComponentsInChildren<Animator>(true);
            var legacy = settings.prefab.GetComponentsInChildren<Animation>(true);
            Transform root = animators.Length == 1 ? animators[0].transform : legacy.Length == 1 ? legacy[0].transform : settings.prefab.transform;
            settings.animationRoot = AnimationUtility.CalculateTransformPath(root, settings.prefab.transform);
            var clips = AnimationUtility.GetAnimationClips(root.gameObject).Where(clip => clip).Distinct().OrderBy(clip => clip.name).ToArray();
            foreach (var choice in settings.clips)
            {
                string[] tokens = choice.key == "walk" ? new[] { "walk", "run" } : new[] { choice.key };
                choice.clip = clips.FirstOrDefault(clip => tokens.Any(token => clip.name.IndexOf(token, StringComparison.OrdinalIgnoreCase) >= 0));
            }
            status = clips.Length == 0 ? "No controller clips found. Drag .anim files into the motion slots and check Animation root."
                : "Found " + clips.Length + " clips. Check idle, walk and attack; hit/death clips are not needed.";
            if (animators.Length > 1) status += " Multiple Animators found: choose the correct Animation root in Alignment options.";
            statusType = MessageType.Info;
        }

        private void Export()
        {
            try
            {
                string viewer = Path.Combine(Application.dataPath, "WildStatSpriteExporter", "Viewer");
                lastExport = SpriteExporter.Export(settings, SpriteExporter.DefaultExportRoot(), viewer);
                SpriteExportBatch.Remember(lastExport, settings.prefab);
                var manifest = JsonUtility.FromJson<SpriteManifest>(File.ReadAllText(Path.Combine(lastExport, "sprite.json")));
                status = "Exported " + manifest.animations.Sum(clip => clip.frames.Count) + " frames in " + manifest.pages.Count + " sheets. Preview before using in the game.";
                if (manifest.warnings.Count > 0) status += "\n" + string.Join("\n", manifest.warnings);
                statusType = manifest.warnings.Count > 0 ? MessageType.Warning : MessageType.Info;
            }
            catch (OperationCanceledException error) { status = error.Message; statusType = MessageType.Info; }
            catch (Exception error) { status = error.Message; statusType = MessageType.Error; Debug.LogException(error); }
        }
    }
}
