// This file deliberately has no Unity dependency: geometry/timing are tested offline.
using System;
using System.Text.RegularExpressions;

namespace WildStat.ArtTools
{
    public static class SpriteMotions
    {
        // Hit flashes and defeat effects remain owned by the game's renderer.
        public static readonly System.Collections.Generic.IReadOnlyList<string> CoreKeys = Array.AsReadOnly(new[] { "idle", "walk", "attack" });

        public static bool UsesGameEffect(string key)
        {
            return string.Equals(key, "hit", StringComparison.OrdinalIgnoreCase) || string.Equals(key, "death", StringComparison.OrdinalIgnoreCase);
        }
    }

    public static class SpriteMath
    {
        public const int MaxFramesPerClip = 600;
        public const int MaxSheetSize = 2048;
        public const int Gutter = 2;

        public static string SafeName(string value)
        {
            var name = Regex.Replace((value ?? "").ToLowerInvariant(), "[^a-z0-9]+", "-").Trim('-');
            if (name.Length == 0) throw new ArgumentException("Enter a name using letters or numbers.");
            return name.Substring(0, Math.Min(name.Length, 64));
        }

        public static int FrameCount(double seconds, int fps)
        {
            if (double.IsNaN(seconds) || double.IsInfinity(seconds) || seconds < 0 || fps < 1 || fps > 60)
                throw new ArgumentException("Invalid animation duration or frame rate.");
            // Unity stores clip lengths as floats (e.g. 16/12 may become
            // 1.333333373). Avoid inventing a 17th frame from that roundoff.
            var count = Math.Max(1, Math.Ceiling(seconds * fps - .0001));
            if (count > MaxFramesPerClip) throw new ArgumentException("Animation exceeds 600 frames. Lower the FPS or shorten the clip.");
            return (int)count;
        }

        public static double SampleTime(int index, int count, double seconds, bool loop)
        {
            if (index < 0 || index >= count) throw new ArgumentOutOfRangeException("index");
            if (count == 1 || seconds <= 0) return 0;
            // Loops omit the duplicated end pose. One-shots retain the last pose,
            // stopping just short of the exact loop boundary of a looping source clip.
            return loop ? seconds * index / count : Math.Min(seconds * index / (count - 1), Math.Max(0, seconds - .000001));
        }

        public static double FrameDurationMs(int count, double seconds, int fps)
        {
            return (seconds > 0 ? seconds : 1.0 / fps) * 1000 / count;
        }

        public static SheetLayout Layout(int frameSize, int frameCount)
        {
            if (frameSize != 64 && frameSize != 128 && frameSize != 256 && frameSize != 512)
                throw new ArgumentException("Frame size must be 64, 128, 256, or 512.");
            if (frameCount < 1 || frameCount > MaxFramesPerClip) throw new ArgumentException("Invalid frame count.");
            int cell = frameSize + Gutter * 2;
            int columns = Math.Min(frameCount, MaxSheetSize / cell);
            int rows = Math.Min((int)Math.Ceiling((double)frameCount / columns), MaxSheetSize / cell);
            return new SheetLayout { cell = cell, columns = columns, rows = rows, capacity = columns * rows, width = columns * cell, height = rows * cell };
        }

        public static CaptureSquare Fit(double minX, double minY, double maxX, double maxY, double anchorX, double anchorY, double padding)
        {
            foreach (double value in new[] { minX, minY, maxX, maxY, anchorX, anchorY, padding })
                if (double.IsNaN(value) || double.IsInfinity(value)) throw new ArgumentException("Non-finite sprite bounds.");
            if (maxX < minX || maxY < minY || padding < 0 || padding > .4) throw new ArgumentException("Invalid sprite bounds or padding.");
            minX = Math.Min(minX, anchorX); minY = Math.Min(minY, anchorY);
            maxX = Math.Max(maxX, anchorX); maxY = Math.Max(maxY, anchorY);
            double side = Math.Max(Math.Max(maxX - minX, maxY - minY), .01) / (1 - padding * 2);
            return new CaptureSquare { x = (minX + maxX - side) / 2, y = (minY + maxY - side) / 2, size = side };
        }

        public static byte StraightChannel(byte channel, byte alpha, bool linearRendering)
        {
            if (alpha == 0) return 0;
            if (alpha == 255) return channel;
            double value = channel / 255.0;
            if (linearRendering) value = value <= .04045 ? value / 12.92 : Math.Pow((value + .055) / 1.055, 2.4);
            value = Math.Min(1, value * 255 / alpha);
            if (linearRendering) value = value <= .0031308 ? value * 12.92 : 1.055 * Math.Pow(value, 1 / 2.4) - .055;
            return (byte)Math.Round(Math.Max(0, Math.Min(1, value)) * 255);
        }
    }

    public struct SheetLayout { public int cell, columns, rows, capacity, width, height; }
    public struct CaptureSquare { public double x, y, size; }
}
