// ========== 配置（和你仓库一致，不用改） ==========
const CONFIG = {
  owner: "maomingwuzixi",
  repo: "image-gallery",
  branch: "main",
  imageDir: "images/"
};

// ========== 工具函数 ==========
function showTip(text, type = "info") {
  const oldTip = document.querySelector(".global-tip");
  if (oldTip) oldTip.remove();
  const tip = document.createElement("div");
  tip.className = "global-tip";
  tip.style.background = type === "error" ? "#ef4444" : "#2563eb";
  tip.textContent = text;
  document.body.appendChild(tip);
  setTimeout(() => {
    tip.style.opacity = "0";
    setTimeout(() => tip.remove(), 500);
  }, 2000);
}

// 生成 GitHub 图片原始链接
function getImageUrl(filename) {
  return `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}/${CONFIG.imageDir}${encodeURIComponent(filename)}`;
}

// 读取 GitHub 仓库里的图片列表（展示用）
async function loadImageList() {
  showTip("同步中...");
  try {
    // 调用 GitHub API 获取 images 目录下的文件
    const res = await fetch(`https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.imageDir}`);
    if (!res.ok) throw new Error("加载失败");
    const files = await res.json();
    // 过滤出图片文件
    const images = files
      .filter(file => file.type === "file" && file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i))
      .map(file => ({
        name: file.name,
        url: getImageUrl(file.name),
        path: file.path
      }));
    renderGallery(images);
    showTip(`同步成功：共 ${images.length} 张`);
  } catch (e) {
    showTip("同步失败，请手动刷新页面", "error");
    console.error(e);
    // 降级：如果 API 失败，显示空页面
    document.getElementById("image-gallery").innerHTML = `<div class="empty-tip">暂无图片，请手动上传到 GitHub 仓库</div>`;
  }
}

// 渲染相册
function renderGallery(images) {
  const $gallery = document.getElementById("image-gallery");
  $gallery.innerHTML = "";
  if (images.length === 0) {
    $gallery.innerHTML = `<div class="empty-tip">暂无图片，请手动上传到 GitHub 仓库的 images/ 文件夹</div>`;
    return;
  }
  images.forEach(img => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.innerHTML = `
      <img src="${img.url}" alt="${img.name}" class="image-preview" loading="lazy">
      <div class="image-actions">
        <a href="${img.url}" target="_blank" class="download-btn">
          <i class="fas fa-download"></i> 下载
        </a>
        <div class="delete-btn" data-path="${img.path}">
          <i class="fas fa-trash"></i> 删除
        </div>
      </div>
    `;
    // 绑定删除（提示手动去 GitHub 删除）
    card.querySelector(".delete-btn").addEventListener("click", () => {
      alert("删除功能需要手动去 GitHub 仓库操作：\n1. 打开 https://github.com/maomingwuzixi/image-gallery\n2. 进入 images/ 文件夹\n3. 删除对应图片");
    });
    $gallery.appendChild(card);
  });
}

// ========== 核心修改：电脑上传方案 ==========
// 电脑不能直接调用 GitHub API，改为「提示手动上传」
function handleFileUpload(e) {
  const files = Array.from(e.target.files);
  if (files.length === 0) return;

  // 生成手动上传指引
  let guide = "请按以下步骤手动上传（电脑/手机通用）：\n\n";
  guide += "1. 打开你的 GitHub 仓库：\nhttps://github.com/maomingwuzixi/image-gallery\n";
  guide += "2. 进入「images/」文件夹\n";
  guide += "3. 点击「Add file」→「Upload files」\n";
  guide += "4. 拖入以下图片：\n";
  files.forEach(f => guide += `- ${f.name}\n`);
  guide += "\n5. 提交后，回到本页面点击「同步相册」即可看到！";

  alert(guide);
  showTip("已生成上传指引，请按提示操作");
  e.target.value = "";
}

// ========== 初始化 ==========
document.addEventListener("DOMContentLoaded", () => {
  // 绑定上传事件
  document.getElementById("file-upload").addEventListener("change", handleFileUpload);
  // 绑定同步事件
  document.getElementById("sync-btn").addEventListener("click", loadImageList);
  // 页面加载自动同步
  loadImageList();
});
