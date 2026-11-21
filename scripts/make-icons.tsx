// Owner: P4 - Game Layer & Map (see TEAM.md)
// One-off: render app icons to public/icons/ with next/og. Re-run with `npm run icons`
// after changing the design. Output is committed so the app needs no network for icons.
import { mkdir, writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

const SIZES = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

function Icon({ size }: { size: number }) {
  // Full-bleed background (iOS rounds the corners itself), content kept inside the
  // central ~70% so it also survives Android "maskable" cropping.
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #1d2742 0%, #0b0f1a 100%)",
      }}
    >
      <div
        style={{
          width: size * 0.62,
          height: size * 0.62,
          borderRadius: "50%",
          background: "#ff8a3d",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0b0f1a",
          fontSize: size * 0.46,
          fontWeight: 800,
        }}
      >
        T
      </div>
    </div>
  );
}

async function main() {
  await mkdir("public/icons", { recursive: true });
  for (const { file, size } of SIZES) {
    const res = new ImageResponse(<Icon size={size} />, { width: size, height: size });
    await writeFile(`public/icons/${file}`, Buffer.from(await res.arrayBuffer()));
    console.log(`wrote public/icons/${file}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
