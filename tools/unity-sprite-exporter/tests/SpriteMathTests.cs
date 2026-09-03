using System;
using WildStat.ArtTools;

public static class SpriteMathTests
{
    private static int checks;
    private static void Check(bool value, string message) { checks++; if (!value) throw new Exception(message); }
    private static void Reject(Action action) { bool rejected = false; try { action(); } catch (ArgumentException) { rejected = true; } Check(rejected, "Expected validation failure"); }

    public static int Main()
    {
        Check(string.Join(",", SpriteMotions.CoreKeys) == "idle,walk,attack", "Only core animation clips are exported by default");
        Check(SpriteMotions.UsesGameEffect("hit"), "Hit stays in the game");
        Check(SpriteMotions.UsesGameEffect("Death"), "Migrate prior death slot case-insensitively");
        Check(!SpriteMotions.UsesGameEffect("attack"), "Keep attack animation");
        Check(SpriteMath.SafeName("../Horn Rabbit / Attack!") == "horn-rabbit-attack", "Safe filename");
        Reject(() => SpriteMath.SafeName("../"));
        Check(SpriteMath.FrameCount(1, 12) == 12, "Twelve frames");
        Check(SpriteMath.FrameCount(0, 12) == 1, "Still pose");
        Check(SpriteMath.FrameCount(.51, 12) == 7, "Round up fractional duration");
        Check(SpriteMath.FrameCount(1.3333333730697632, 12) == 16, "Ignore Unity float roundoff at whole frame boundary");
        Check(SpriteMath.FrameCount(.6666666865348816, 12) == 8, "Ignore Unity float roundoff in short loops");
        Reject(() => SpriteMath.FrameCount(100, 12));
        Reject(() => SpriteMath.FrameCount(double.NaN, 12));
        Reject(() => SpriteMath.FrameCount(1, 0));
        Check(SpriteMath.SampleTime(11, 12, 1, true) < .92, "Loop does not duplicate endpoint");
        Check(SpriteMath.SampleTime(11, 12, 1, false) > .999, "One-shot includes final pose");
        Check(SpriteMath.SampleTime(0, 1, 0, false) == 0, "Zero-length sample");
        Check(Math.Abs(SpriteMath.FrameDurationMs(7, .51, 12) * 7 - 510) < .00001, "Exact total animation duration");
        foreach (int size in new[] { 64, 128, 256, 512 })
            foreach (int frames in new[] { 1, 7, 48, 49, 50, 600 })
            {
                var layout = SpriteMath.Layout(size, frames);
                Check(layout.width <= 2048 && layout.height <= 2048, "Mobile texture size ceiling");
                Check(layout.capacity > 0 && layout.capacity <= frames + layout.columns - 1, "Valid atlas capacity");
                Check(layout.cell == size + 4, "Transparent gutters");
            }
        Reject(() => SpriteMath.Layout(4096, 1));
        Reject(() => SpriteMath.Layout(128, 0));
        var square = SpriteMath.Fit(-1, 0, 1, 4, 0, 0, .1);
        Check(Math.Abs(square.size - 5) < .00001, "Fit every pose using common square");
        Check(square.x <= -1 && square.x + square.size >= 1 && square.y < 0, "Bounds and ground anchor padded");
        var withGround = SpriteMath.Fit(-1, 2, 1, 4, 0, 0, 0);
        Check(withGround.y == 0, "Flying sprite retains ground anchor");
        Reject(() => SpriteMath.Fit(0, 0, double.PositiveInfinity, 1, 0, 0, .1));
        Check(SpriteMath.StraightChannel(64, 128, false) == 128, "Unpremultiply gamma RGB");
        Check(SpriteMath.StraightChannel(0, 0, false) == 0, "Transparent pixels remain clean");
        Check(SpriteMath.StraightChannel(128, 128, false) == 255, "Recover saturated edge color");
        Check(Math.Abs(SpriteMath.StraightChannel(188, 128, true) - 255) <= 1, "Unpremultiply in linear light when required");
        Console.WriteLine("Sprite exporter math: " + checks + " checks passed.");
        return 0;
    }
}
