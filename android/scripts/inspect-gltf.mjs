import { execFileSync } from "node:child_process";

const repo = "proofofplay/piratenation-art";

async function fetchPath(path) {
  const url =
    "https://github.com/" +
    repo +
    "/raw/main/" +
    path.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return Buffer.from(await res.arrayBuffer());
}

const targets = process.argv.slice(2);
for (const path of targets) {
  try {
    const buf = await fetchPath(path);
    if (!path.endsWith(".gltf")) {
      console.log(`${path}: ${buf.length} bytes`);
      continue;
    }
    const gltf = JSON.parse(buf.toString("utf8"));
    const images = (gltf.images || []).map((i) => i.uri || "(embedded)");
    const buffers = (gltf.buffers || []).map((b) => b.uri || "(embedded)");
    const meshCount = (gltf.meshes || []).length;
    const primCount = (gltf.meshes || []).reduce((n, m) => n + (m.primitives || []).length, 0);
    console.log(
      `${path.split("/").pop()}: ${buf.length} bytes, meshes=${meshCount}, prims=${primCount}, images=${images.length}, buffers=${buffers.length}`,
    );
    console.log("  images:", images.slice(0, 6));
    console.log("  buffers:", buffers.slice(0, 3));
  } catch (e) {
    console.log(`${path}: ERROR ${e.message}`);
  }
}
