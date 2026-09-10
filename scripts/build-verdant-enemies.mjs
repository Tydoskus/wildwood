import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../public/assets/wildstat/enemies/verdant-crypt/', import.meta.url);
await mkdir(root, { recursive: true });
const roles = ['stalker', 'slinger', 'regent', 'guardian', 'reaver', 'oracle'];
for (const [index, role] of roles.entries()) {
  const colors = ['#a9db84', '#73f0c3', '#ded69e', '#b5d7b9', '#bda5e4', '#70dae1'];
  const accent = colors[index], armored = role === 'guardian', royal = role === 'regent', caster = role === 'oracle', ranged = role === 'slinger';
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="384" viewBox="0 0 1024 384">'];
  for (let row = 0; row < 3; row++) for (let frame = 0; frame < 8; frame++) {
    const phase = frame * Math.PI / 4;
    const stride = row === 1 ? Math.sin(phase) * 9 : 0;
    const attack = row === 2 ? Math.sin(frame / 7 * Math.PI) : 0;
    const bob = Math.sin(phase) * (row === 1 ? 2.5 : 1.2);
    parts.push(`<g transform="translate(${frame * 128} ${row * 128})" stroke="#182e27" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
      <ellipse cx="63" cy="111" rx="31" ry="6" fill="#061c1666" stroke="none"/>
      <g transform="translate(0 ${bob})">
      ${caster ? '<path d="M44 62 Q61 50 79 64 L90 104 70 96 58 109 35 100Z" fill="#345e51"/>' : `<path d="M47 74 L${44-stride} 92 ${37-stride} 104 M69 75 L${73+stride} 92 ${82+stride} 104" fill="none" stroke="#91a788" stroke-width="10"/><path d="M${37-stride} 104h15 M${72+stride} 104h17" stroke="#375634" stroke-width="8"/>`}
      <path d="M40 42 Q59 32 79 45 L82 70 68 85 45 78 35 60Z" fill="#436742"/>
      <path d="M49 46 L66 43 76 56 65 77 46 67Z" fill="#d3cfaa"/>
      <path d="M52 51 L65 57 51 59 63 64" fill="none" stroke="#718960" stroke-width="3"/>
      <path d="M37 45 Q25 57 35 80 Q44 87 40 94 M77 46 Q89 65 82 83" fill="none" stroke="#294c35" stroke-width="7"/>
      <path d="M43 22 Q56 12 75 24 L80 39 69 51 49 44 37 34Z" fill="#e0ddba"/>
      <path d="M57 30 L67 28 65 36 56 35Z M73 29L81 31 77 37 71 35Z" fill="${accent}"/>
      <path d="M65 39 L71 38 71 43 M42 21 L34 12 M49 19 L47 8" fill="none" stroke="#35533a"/>
      ${royal ? '<path d="M40 23 L36 10 49 16 57 4 65 17 79 9 77 24Z" fill="#d9d298"/><circle cx="57" cy="15" r="4" fill="#90f1cc"/>' : ''}
      ${ranged || caster ? `<path d="M35 25 Q47 5 65 13 Q86 13 90 29 Q61 39 35 25Z" fill="${accent}"/><circle cx="49" cy="22" r="3" fill="#e6ffe5" stroke="none"/><circle cx="74" cy="23" r="4" fill="#e6ffe5" stroke="none"/>` : '<path d="M36 36 Q29 20 22 29 Q17 36 34 39 M76 19 Q78 7 86 12 Q92 22 76 24" fill="#82c087" stroke-width="2"/>'}
      ${armored ? '<path d="M22 47 L46 40 50 70 38 95 17 77Z" fill="#7d9080"/><path d="M27 52 L38 49 43 70 35 82 26 74Z" fill="#3d624c"/>' : ''}
      <g transform="rotate(${-attack*38} 74 54)">
        <path d="M69 50 L83 57 90 71" fill="none" stroke="#c4c8a3" stroke-width="9"/>
        ${role === 'reaver' ? '<path d="M86 78L100 35 Q108 14 121 22 Q115 18 108 48" fill="none" stroke="#bdbad0" stroke-width="7"/><path d="M93 59Q108 58 104 44" fill="none" stroke="#63844e"/>'
          : ranged || caster ? `<path d="M93 87L100 27" stroke="#58784b" stroke-width="7"/><circle cx="101" cy="26" r="10" fill="${accent}"/><path d="M91 20Q99 10 109 19" fill="none" stroke="#d4e7b0"/>`
          : '<path d="M88 76 L100 51 114 42 109 62 95 82Z" fill="#bfcdac"/><path d="M99 55L106 53" stroke="#597751"/>'}
      </g>
      ${row === 2 && frame >= 3 && frame <= 5 && (ranged || caster) ? `<circle cx="115" cy="44" r="7" fill="${accent}" stroke="#e5ffe3" stroke-width="2"/>` : ''}
      </g></g>`);
  }
  parts.push('</svg>');
  await writeFile(new URL(`${role}.svg`, root), parts.join('\n').split('\n').map(line => line.trimEnd()).join('\n') + '\n');
}
console.log('Built six Verdant Crypt enemy sheets with idle, walk, and attack motions.');
