// ========== 安全版：修复上传无反应问题 ==========
const CFG = {
  owner: "maomingwuzixi",
  repo: "image-gallery",
  branch: "main",
  dir: "images/"
};
const CACHE = "gallery_cache";

// 简化DOM获取
const el = (s) => document.querySelector(s);
const $up = el("#file-upload");
const $gal = el("#image-gallery");
const $sync = el("#sync-github");
const $dlAll = el("#download-all");
const $clear = el("#clear-all");

// 初始化
init();

function init() {
  // 绑定事件（修复事件绑定方式）
  $up.addEventListener('change', upload, false);
  $sync.addEventListener('click', sync, false);
  $dlAll.addEventListener('click', downloadAll, false);
  $clear.addEventListener('click', clearAll, false);
  
  // 首次同步
  sync();
}

// 提示框（优化显示）
function tip(text, type = "info") {
  // 先移除旧提示
  const oldTip = document.querySelector('.global-tip');
  if (oldTip) oldTip.remove();
  
  const t = document.createElement("div");
  t.className = 'global-tip';
  t.style = `
    position:fixed;
    top:20px;
    left:50%;
    transform:translateX(-50%);
    background:${type === 'error' ? '#ef4444' : '#2563eb'};
    color:white;
    padding:12px 24px;
    border-radius:8px;
    z-index:9999;
    font-size:14px;
    box-shadow:0 4px 12px rgba(0,0,0,0.15);
  `;
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.5s';
    setTimeout(() => t.remove(), 500);
  }, 2000);
}

// 同步GitHub图片（公开接口，无需token）
async function sync() {
  tip("正在同步图片...");
  try {
    // 优化请求超时
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const r = await fetch(
      `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dir}`,
      {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Mozilla/5.0' // 必须加UA，否则会被拦截
        }
      }
    );
    clearTimeout(timeoutId);

    if (r.status === 404) {
      // 文件夹不存在，初始化空数组
      localStorage.setItem(CACHE, "[]");
      render([]);
      tip("同步完成：暂无图片");
      return;
    }
    
    if (!r.ok) throw new Error(`GitHub接口返回：${r.status}`);
    
    const list = await r.json();
    if (!Array.isArray(list)) {
      render([]);
      localStorage.setItem(CACHE, "[]");
      tip("同步完成：暂无图片");
      return;
    }

    // 过滤图片文件
    const exts = ["jpg", "jpeg", "png", "gif", "webp"];
    const imgs = list
      .filter(x => exts.includes(x.name.split(".").pop().toLowerCase()))
      .map(x => ({
        name: x.name,
        url: x.download_url,
        sha: x.sha,
        size: (x.size / 1024).toFixed(2) + 'KB'
      }));

    // 保存到本地缓存
    localStorage.setItem(CACHE, JSON.stringify(imgs));
    // 渲染图片
    render(imgs);
    tip(`同步成功：共 ${imgs.length} 张图片`);
  } catch (e) {
    tip(`同步失败：${e.message}`, "error");
    console.error("同步失败详情：", e);
    // 用本地缓存兜底
    const localImgs = JSON.parse(localStorage.getItem(CACHE) || "[]");
    render(localImgs);
  }
}

// 上传图片到GitHub（修复核心：优化代理和请求头）
async function upload() {
  const files = Array.from($up.files);
  if (files.length === 0) return;
  
  tip(`开始上传：共 ${files.length} 张图片`);
  let successCount = 0;
  let failCount = 0;

  // 逐个上传（避免并发被拦截）
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    
    // 校验文件
    if (!f.type.startsWith("image/")) {
      tip(`跳过非图片文件：${f.name}`, "error");
      failCount++;
      continue;
    }
    if (f.size > 20 * 1024 * 1024) {
      tip(`文件过大：${f.name}（超过20MB）`, "error");
      failCount++;
      continue;
    }

    // 生成唯一文件名
    const fileName = `${Date.now()}_${f.name.replace(/\s+/g, "_")}`;
    const filePath = `${CFG.dir}${fileName}`;

    try {
      // 转换为Base64（修复读取方式）
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(f);
      });

      // 核心修复：使用更稳定的代理 + 完整请求头
      const response = await fetch(
        `https://gh.api.99988866.xyz/https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${filePath}`,
        {
          method: "PUT",
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          body: JSON.stringify({
            message: `Upload image: ${fileName}`,
            content: base64Data.split(",")[1], // 去掉Base64前缀
            branch: CFG.branch
          }),
          timeout: 30000 // 延长超时时间
        }
      );

      const result = await response.json();
      
      if (response.ok && result.content) {
        successCount++;
        tip(`上传成功：${fileName}`);
      } else {
        throw new Error(result.message || `HTTP ${response.status}`);
      }
    } catch (e) {
      tip(`上传失败：${fileName}（${e.message}）`, "error");
      failCount++;
      console.error(`上传${fileName}失败：`, e);
    }
  }

  // 上传完成提示
  tip(`上传完成：成功 ${successCount} 张，失败 ${failCount} 张`);
  // 清空文件选择器
  $up.value = "";
  // 重新同步图片列表
  setTimeout(sync, 1000);
}

// 渲染图片列表（修复渲染逻辑）
function render(imgs) {
  $gal.innerHTML = "";

  if (imgs.length === 0) {
    $gal.innerHTML = `
      <div class="empty-tip">
        <i class="fas fa-images" style="font-size:48px;color:#ddd;margin-bottom:16px;display:block"></i>
        暂无图片，点击上传按钮添加
      </div>
    `;
    return;
  }

  // 渲染每张图片
  imgs.forEach(img => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.innerHTML = `
      <img 
        src="${img.url}" 
        alt="${img.name}" 
        class="image-preview" 
        title="点击查看大图 | ${img.size}"
        loading="lazy"
      >
      <div class="image-actions">
        <div class="download-btn" data-url="${img.url}" data-name="${img.name}">
          <i class="fas fa-download"></i> 下载
        </div>
        <div class="delete-btn" data-name="${img.name}" data-sha="${img.sha}">
          <i class="fas fa-trash"></i> 删除
        </div>
      </div>
    `;
    $gal.appendChild(card);

    // 绑定预览大图事件
    card.querySelector(".image-preview").addEventListener('click', () => {
      const win = window.open('', '_blank');
      win.document.write(`
        <html>
          <head>
            <title>预览：${img.name}</title>
            <style>
              body { margin:0; padding:20px; background:#f5f5f5; text-align:center; }
              img { max-width:95%; max-height:95vh; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.1); }
            </style>
          </head>
          <body>
            <img src="${img.url}" alt="${img.name}">
          </body>
        </html>
      `);
    });
  });

  // 绑定下载和删除事件
  bindImageActions();
}

// 绑定图片操作事件（下载/删除）
function bindImageActions() {
  // 下载单张
  document.querySelectorAll(".download-btn").forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.url;
      const name = btn.dataset.name;
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      tip(`开始下载：${name}`);
    });
  });

  // 删除单张
  document.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      const sha = btn.dataset.sha;
      
      if (!confirm(`确定删除图片：${name}？删除后无法恢复！`)) return;

      try {
        tip(`正在删除：${name}`);
        // 调用GitHub删除接口（带代理）
        const response = await fetch(
          `https://gh.api.99988866.xyz/https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dir}${name}`,
          {
            method: "DELETE",
            headers: {
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0'
            },
            body: JSON.stringify({
              message: `Delete image: ${name}`,
              sha: sha,
              branch: CFG.branch
            })
          }
        );

        if (response.ok) {
          tip(`删除成功：${name}`);
          sync(); // 重新同步
        } else {
          const res = await response.json();
          throw new Error(res.message || `HTTP ${response.status}`);
        }
      } catch (e) {
        tip(`删除失败：${name}（${e.message}）`, "error");
        console.error(`删除${name}失败：`, e);
      }
    });
  });
}

// 批量下载所有图片
function downloadAll() {
  const imgs = JSON.parse(localStorage.getItem(CACHE) || "[]");
  if (imgs.length === 0) {
    tip("暂无图片可下载", "error");
    return;
  }

  if (confirm(`确定下载全部 ${imgs.length} 张图片？`)) {
    tip(`开始批量下载：共 ${imgs.length} 张`);
    // 逐个下载（避免浏览器拦截）
    imgs.forEach((img, index) => {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = img.url;
        a.download = img.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, index * 500);
    });
    tip("批量下载已触发，查看浏览器下载列表");
  }
}

// 清空所有图片
async function clearAll() {
  const imgs = JSON.parse(localStorage.getItem(CACHE) || "[]");
  if (imgs.length === 0) {
    tip("暂无图片可清空", "error");
    return;
  }

  if (!confirm(`确定清空全部 ${imgs.length} 张图片？此操作不可恢复！`)) return;

  tip(`正在清空：共 ${imgs.length} 张图片`);
  let success = 0;

  // 逐个删除
  for (const img of imgs) {
    try {
      const response = await fetch(
        `https://gh.api.99988866.xyz/https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents/${CFG.dir}${img.name}`,
        {
          method: "DELETE",
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          body: JSON.stringify({
            message: "Clear all images",
            sha: img.sha,
            branch: CFG.branch
          })
        }
      );

      if (response.ok) success++;
    } catch (e) {
      console.error(`清空${img.name}失败：`, e);
    }
  }

  // 清空本地缓存
  localStorage.setItem(CACHE, "[]");
  render([]);
  tip(`清空完成：成功删除 ${success} 张图片`);
}
