import { mkdir, writeFile } from "node:fs/promises";
const root = new URL("../public/assets/wildstat/enemies/neon-sentry/", import.meta.url);
await mkdir(root, { recursive: true });
const roles = ["prowler", "spitter", "regent", "guardian", "reaver", "oracle"];
const colors = ["#50f5ff", "#ff54d8", "#ffd866", "#69ffb1", "#ac86ff", "#ffa26d"];
for (const [roleIndex, role] of roles.entries()) {
  const accent = colors[roleIndex];
  const armored = role === "guardian", crown = role === "regent", blade = role === "reaver", floating = role === "oracle";
  const body = `<g stroke="#080e21" stroke-width="4" stroke-linejoin="round">
    <path d="M42 40 L69 37 86 51 78 81 44 82 34 59Z" fill="#253b59"/>
    <path d="M43 47 L67 44 78 54 69 68 46 67Z" fill="#406183" stroke="${accent}" stroke-width="2"/>
    <circle cx="59" cy="56" r="7" fill="${accent}" stroke="#e7ffff" stroke-width="2"/>
    <path d="M40 20 L69 18 85 28 78 45 47 44 35 33Z" fill="#29425f"/>
    <path d="M61 27 H84 L79 35 H59Z" fill="${accent}" stroke-width="2"/>
    <path d="M43 19 L38 9 M70 18 L76 10" fill="none" stroke="${accent}" stroke-width="3"/>
    ${crown ? '<path d="M37 17 L36 5 48 12 59 2 66 12 81 5 77 19Z" fill="#ffd866"/>' : ''}
    ${armored ? '<path d="M23 43 L43 36 48 72 37 88 19 71Z" fill="#324c64" stroke="#69ffb1"/>' : ''}
    ${floating ? '<path d="M23 42 L29 28 34 43 29 55Z M91 46 L99 32 105 48 99 61Z" fill="#ffa26d"/>' : ''}
  </g>`;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="384" viewBox="0 0 1024 384"><defs><g id="body">${body}</g></defs>`];
  for (let row = 0; row < 3; row++) for (let frame = 0; frame < 8; frame++) {
    const phase = frame / 8 * Math.PI * 2;
    const stride = row === 1 ? Math.sin(phase) * 12 : 1;
    const bob = floating ? Math.sin(phase) * 4 - 4 : Math.sin(phase) * (row === 1 ? 2 : 1);
    const fire = row === 2 && frame >= 3 && frame <= 5;
    parts.push(`<g transform="translate(${frame * 128} ${row * 128})"><ellipse cx="62" cy="109" rx="31" ry="7" fill="#070d2180"/>
      <g transform="translate(0 ${bob.toFixed(2)})" stroke="#080e21" stroke-width="4" stroke-linejoin="round">
        ${floating ? `<path d="M43 83 L59 104 76 83Z" fill="${accent}"/><ellipse cx="60" cy="101" rx="28" ry="7" fill="none" stroke="${accent}" stroke-width="2"/>`
        : `<path d="M45 77 L${44-stride} 96 ${36-stride} 102 ${53-stride} 104 ${60-stride} 93 62 77Z" fill="#1b2b45"/><path d="M66 77 L${65+stride} 98 ${58+stride} 105 ${81+stride} 105 ${79+stride} 96 78 77Z" fill="#36516e"/><path d="M${63+stride} 99 H${77+stride}" stroke="${accent}" stroke-width="3"/>`}
        <use href="#body"/>
        <g transform="rotate(${row === 2 ? -8 + frame * 2 : 4} 68 53)">
          <path d="M65 47 L79 52 90 65 79 75 61 62Z" fill="#395979"/>
          ${blade ? `<path d="M82 61 L106 14 116 10 99 63 92 77Z" fill="#ac86ff" stroke="#e4d8ff" stroke-width="2"/>`
            : `<path d="M80 54 H111 V70 H93 L87 77 79 68Z" fill="#1d304b"/><path d="M87 58 H108" stroke="${accent}" stroke-width="4"/>`}
        </g>
        ${fire ? `<path d="M110 58 L124 53 118 63 126 68 110 68Z" fill="${accent}" stroke="#ffffff" stroke-width="2"/>` : ''}
      </g></g>`);
  }
  parts.push("</svg>");
  await writeFile(new URL(role + ".svg", root), parts.join("\n").split("\n").map(line => line.trimEnd()).join("\n"));
}
console.log("Built six original neon sentry sheets: idle, walk and attack.");
