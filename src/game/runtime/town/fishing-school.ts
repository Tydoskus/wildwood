/** Fish under the surface follow an oval current. The lead fish breaks away
 * from the shoal to nose the cork in the last part of a cast. */
export function drawFishingSchool(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, bite: number) {
  for (let i = 0; i < 3; i++) {
    const angle = time * (.75 + i * .09) + i * 2.1;
    const circle = 1 - (i === 0 ? bite * .91 : 0);
    const sx = Math.cos(angle) * (28 - i * 4) * circle;
    const sy = Math.sin(angle) * (11 + i) * circle;
    ctx.save();
    ctx.translate(x + sx, y + sy);
    ctx.rotate(Math.atan2(Math.cos(angle) * 12, -Math.sin(angle) * 28));
    ctx.scale(1 - i * .13, 1 - i * .13);
    const flick = Math.sin(time * 7 + i) * 2;
    ctx.globalAlpha = .72;
    ctx.fillStyle = "#164755";
    ctx.beginPath(); ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(5, -5, -5, -2); ctx.lineTo(-11, flick - 3.5);
    ctx.lineTo(-10, flick + 3.5); ctx.lineTo(-5, 1.5);
    ctx.quadraticCurveTo(4, 5, 10, 0); ctx.fill();
    ctx.fillStyle = "#8abcb5";
    ctx.globalAlpha = .66;
    ctx.fillRect(2, -2, 4, 1);
    ctx.restore();
  }
}
