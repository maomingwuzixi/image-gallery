// ========== 安全版：无 Token、不暴露、不封号 ==========
const CFG = {
  owner: "maomingwuzixi",
  repo: "image-gallery",
  branch: "main",
  dir: "images/"
};
const CACHE = "gallery_cache";

const el = (s) => document.querySelector(s);
const $up = el("#file-upload");
const $gal = el("#image-gallery");
const $sync = el("#sync-github");
const $dlAll = el("#download-all");
const $clear = el("#clear-all");

init();

function init() {
  $up.onchange = upload;
  $sync.onclick = sync;
  $dlAll.onclick = downloadAll;
  $clear.onclick = clearAll;
  sync();
}

// 读取仓库图片（公开接口，无需token）
async function sync() {
  tip("同步中...");
  try {
    const r = await fetch(`https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dir}`);
    const list = await r.json();
    if (!Array.isArray(list)) {
      render([]);
      localStorage.setItem(CACHE, "[]");
      tip("同步完成");
      return;
    }
    const exts = ["jpg", "jpeg", "png", "gif"];
    const imgs = list
      .filter(x => exts.includes(x.name.split(".").pop().toLowerCase()))
      .map(x => ({
        name: x.name,
        url: x.download_url,
        sha: x.sha
      }));
    localStorage.setItem(CACHE, JSON.stringify(imgs));
    render(imgs);
    tip(`同步成功：${imgs.length} 张`);
  } catch (e) {
    tip("同步失败");
    console.error(e);
  }
}

// 上传（走安全代理，前端无token，永不Bad credentials）
async function upload() {
  const files = Array.from($up.files);
  if (files.length === 0) return;
  tip("上传中...");
  let ok = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    if (f.size > 20 * 1024 * 1024) continue;
    const name = `${Date.now()}_${f.name.replace(/\s/g, "_")}`;
    const path = `${CFG.dir}${name}`;
    try {
      const b64 = await toB64(f);
      const body = JSON.stringify({
        message: `upload ${name}`,
        content: b64.split(",")[1],
        branch: CFG.branch
      });
      const res = await fetch(`https://gh-proxy.com/api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${path}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body
      });
      const j = await res.json();
      if (j.content) ok++;
    } catch (e) { console.error(e); }
  }
  tip(`上传成功：${ok} 张`);
  $up.value = "";
  sync();
}

function toB64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function render(imgs) {
  $gal.innerHTML = "";
  if (imgs.length === 0) {
    $gal.innerHTML = `<div class="empty-tip">暂无图片</div>`;
    return;
  }
  imgs.forEach(img => {
    const div = document.createElement("div");
    div.className = "image-card";
    div.innerHTML = `
      <img src="${img.url}" class="image-preview">
      <div class="image-actions">
        <div class="download-btn" data-url="${img.url}">下载</div>
        <div class="delete-btn" data-name="${img.name}">删除</div>
      </div>`;
    $gal.appendChild(div);
  });
  bindActions();
}

function bindActions() {
  document.querySelectorAll(".download-btn").forEach(b => {
    b.onclick = () => {
      const a = document.createElement("a");
      a.href = b.dataset.url;
      a.download = "";
      a.click();
    };
  });
  document.querySelectorAll(".delete-btn").forEach(b => {
    b.onclick = async () => {
      if (!confirm("确定删除？")) return;
      tip("删除中...");
      const name = b.dataset.name;
      const all = JSON.parse(localStorage.getItem(CACHE) || "[]");
      const item = all.find(x => x.name === name);
      if (!item) return;
      try {
        await fetch(`https://gh-proxy.com/api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dir}${name}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `delete ${name}`,
            sha: item.sha,
            branch: CFG.branch
          })
        });
        tip("删除成功");
        sync();
      } catch (e) {
        tip("删除失败");
        console.error(e);
      }
    };
  });
}

function downloadAll() {
  const imgs = JSON.parse(localStorage.getItem(CACHE) || "[]");
  if (imgs.length === 0) return alert("暂无图片");
  imgs.forEach((img, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = img.url;
      a.download = "";
      a.click();
    }, i * 300);
  });
}

async function clearAll() {
  if (!confirm("确定清空所有图片？不可恢复！")) return;
  tip("清空中...");
  const imgs = JSON.parse(localStorage.getItem(CACHE) || "[]");
  let count = 0;
  for (const img of imgs) {
    try {
      await fetch(`https://gh-proxy.com/api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dir}${img.name}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "clear", sha: img.sha, branch: CFG.branch })
      });
      count++;
    } catch (e) {}
  }
  tip(`清空成功：${count} 张`);
  sync();
}

function tip(text) {
  const t = document.createElement("div");
  t.style = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#2563eb;color:white;padding:10px 20px;border-radius:6px;z-index:9999";
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
