// ========== GitHub 仓库配置（已为你填好 + 你的真实 token） ==========
const GITHUB_CONFIG = {
    owner: 'maomingwuzixi',
    repo: 'image-gallery',
    branch: 'main',
    imageDir: 'images/',
    apiBaseUrl: 'https://api.github.com/repos',
    // 👇 已替换为你提供的 PAT
    token: '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'
};

// ========== 本地缓存配置 ==========
const CACHE_KEY = 'githubImageGalleryCache';
// DOM元素
const fileUpload = document.getElementById('file-upload');
const imageGallery = document.getElementById('image-gallery');
const downloadAllBtn = document.getElementById('download-all');
const clearAllBtn = document.getElementById('clear-all');
const syncGithubBtn = document.getElementById('sync-github');
const githubStatus = document.getElementById('github-status');

// 初始化
init();

// ========== 1. 初始化函数 ==========
async function init() {
    // 绑定事件
    fileUpload.addEventListener('change', handleFileUpload);
    downloadAllBtn.addEventListener('click', downloadAllImages);
    clearAllBtn.addEventListener('click', clearAllImages);
    syncGithubBtn.addEventListener('click', syncFromGithub);

    // 检查 GitHub 仓库连接状态
    await checkGithubConnection();
    
    // 加载图片（优先从 GitHub 拉取，本地缓存兜底）
    await loadImagesFromGithub();
}

// ========== 2. 检查 GitHub 仓库连接 ==========
async function checkGithubConnection() {
    try {
        githubStatus.className = 'status loading';
        githubStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在连接 GitHub 仓库...';

        // 访问仓库目录，验证是否存在
        const response = await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.imageDir}`);
        
        if (response.ok || response.status === 404) {
            // 404 表示文件夹未创建，后续上传时自动创建
            githubStatus.className = 'status success';
            githubStatus.innerHTML = '<i class="fas fa-check"></i> GitHub 仓库连接成功（跨设备同步已开启）';
            return true;
        } else {
            throw new Error('仓库访问失败');
        }
    } catch (error) {
        githubStatus.className = 'status error';
        githubStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> GitHub 连接失败，仅启用本地缓存';
        console.error('GitHub 连接失败:', error);
        // 加载本地缓存图片
        renderImagesFromCache();
        return false;
    }
}

// ========== 3. 处理文件上传（同步到 GitHub） ==========
async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    const githubConnected = await checkGithubConnection();
    if (!githubConnected) {
        alert('GitHub 连接失败，无法上传图片！');
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // 校验文件
        if (!file.type.startsWith('image/')) {
            alert('请上传图片格式文件（JPG/PNG/GIF）');
            continue;
        }
        if (file.size > 20 * 1024 * 1024) {
            alert('单张图片大小不能超过20MB（GitHub 单文件限制）');
            continue;
        }

        // 生成唯一文件名（避免重复）
        const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const fileUrl = `${GITHUB_CONFIG.imageDir}${fileName}`;

        try {
            // 读取文件为 Base64
            const base64Data = await fileToBase64(file);
            
            // 上传到 GitHub（已加 token）
            const uploadResponse = await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${fileUrl}`, {
                method: 'PUT',
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${GITHUB_CONFIG.token}`
                },
                body: JSON.stringify({
                    message: `Upload image: ${fileName}`,
                    content: base64Data.split(',')[1],
                    branch: GITHUB_CONFIG.branch
                })
            });

            const result = await uploadResponse.json();
            if (uploadResponse.ok) {
                // 上传成功，更新本地缓存
                const imageData = {
                    id: Date.now() + i,
                    name: file.name,
                    fileName: fileName,
                    url: result.content.download_url,
                    size: (file.size / 1024).toFixed(2) + 'KB',
                    time: new Date().toLocaleString()
                };
                saveImageToCache(imageData);
                renderImagesFromCache();
                alert(`图片 ${file.name} 上传成功！`);
            } else {
                throw new Error(result.message || '上传失败');
            }
        } catch (error) {
            console.error('上传失败:', error);
            alert(`图片 ${file.name} 上传失败：${error.message}`);
        }
    }

    fileUpload.value = '';
}

// ========== 4. 文件转 Base64 ==========
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

// ========== 5. 从 GitHub 加载图片 ==========
async function loadImagesFromGithub() {
    try {
        const githubConnected = await checkGithubConnection();
        if (!githubConnected) return;

        // 访问图片文件夹
        const response = await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.imageDir}`);
        
        if (response.status === 404) {
            // 文件夹未创建，显示空提示
            renderImagesFromCache();
            return;
        }

        const files = await response.json();
        if (!files.length) {
            renderImagesFromCache();
            return;
        }

        // 过滤非图片文件
        const imageFiles = files.filter(file => {
            const ext = file.name.split('.').pop().toLowerCase();
            return ['jpg', 'jpeg', 'png', 'gif'].includes(ext);
        });

        // 转换为图片数据格式
        const images = imageFiles.map((file, index) => ({
            id: Date.now() + index,
            name: file.name.replace(/^\d+_/, ''),
            fileName: file.name,
            url: file.download_url,
            size: (file.size / 1024).toFixed(2) + 'KB',
            time: new Date(file.last_modified).toLocaleString()
        }));

        // 更新本地缓存并渲染
        localStorage.setItem(CACHE_KEY, JSON.stringify(images));
        renderImagesFromCache();
    } catch (error) {
        console.error('从 GitHub 加载失败:', error);
        renderImagesFromCache();
    }
}

// ========== 6. 手动同步 GitHub ==========
async function syncFromGithub() {
    githubStatus.className = 'status loading';
    githubStatus.innerHTML = '<i class="fas fa-sync fa-spin"></i> 正在同步 GitHub 图片...';
    
    await loadImagesFromGithub();
    
    githubStatus.className = 'status success';
    githubStatus.innerHTML = '<i class="fas fa-check"></i> GitHub 同步完成！';
    
    setTimeout(async () => {
        await checkGithubConnection();
    }, 3000);
}

// ========== 7. 本地缓存操作 ==========
function getImagesFromCache() {
    const data = localStorage.getItem(CACHE_KEY);
    return data ? JSON.parse(data) : [];
}

function saveImageToCache(imageData) {
    const images = getImagesFromCache();
    images.push(imageData);
    localStorage.setItem(CACHE_KEY, JSON.stringify(images));
}

function renderImagesFromCache() {
    const images = getImagesFromCache();
    imageGallery.innerHTML = '';

    if (images.length === 0) {
        imageGallery.innerHTML = '<div class="empty-tip">暂无图片，点击上传按钮添加</div>';
        return;
    }

    // 渲染图片卡片
    images.forEach(image => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.innerHTML = `
            <img src="${image.url}" alt="${image.name}" class="image-preview" title="点击查看大图">
            <div class="image-actions">
                <div class="download-btn" data-id="${image.id}">
                    <i class="fas fa-download"></i> 下载
                </div>
                <div class="delete-btn" data-id="${image.id}" data-filename="${image.fileName}">
                    <i class="fas fa-trash"></i> 删除
                </div>
            </div>
        `;
        imageGallery.appendChild(card);

        // 预览大图
        card.querySelector('.image-preview').addEventListener('click', () => openImagePreview(image.url, image.name));
        // 单张下载
        card.querySelector('.download-btn').addEventListener('click', () => downloadSingleImage(image));
        // 删除
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            const fileName = e.currentTarget.dataset.filename;
            deleteSingleImage(image.id, fileName);
        });
    });
}

// ========== 8. 下载单张图片 ==========
function downloadSingleImage(image) {
    const a = document.createElement('a');
    a.href = image.url;
    a.download = image.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ========== 9. 批量下载所有图片 ==========
function downloadAllImages() {
    const images = getImagesFromCache();
    if (images.length === 0) {
        alert('暂无图片可下载');
        return;
    }

    if (confirm(`确认下载全部${images.length}张图片？`)) {
        images.forEach((image, index) => {
            setTimeout(() => {
                downloadSingleImage(image);
            }, index * 300);
        });
        alert(`已开始下载全部${images.length}张图片，请查收浏览器下载列表`);
    }
}

// ========== 10. 删除单张图片（同步删除 GitHub 图片，已加 token） ==========
async function deleteSingleImage(id, fileName) {
    if (!confirm('确认删除这张图片吗？GitHub 和所有设备都会同步删除！')) return;

    const githubConnected = await checkGithubConnection();
    const imagePath = `${GITHUB_CONFIG.imageDir}${fileName}`;

    try {
        // 1. 从 GitHub 删除
        if (githubConnected) {
            // 先获取文件的 SHA（删除需要）
            const getFileResponse = await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${imagePath}`);
            if (getFileResponse.ok) {
                const fileData = await getFileResponse.json();
                const deleteResponse = await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${imagePath}`, {
                    method: 'DELETE',
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json',
                        'Authorization': `token ${GITHUB_CONFIG.token}`
                    },
                    body: JSON.stringify({
                        message: `Delete image: ${fileName}`,
                        sha: fileData.sha,
                        branch: GITHUB_CONFIG.branch
                    })
                });

                if (!deleteResponse.ok) {
                    throw new Error('GitHub 删除失败');
                }
            }
        }

        // 2. 从本地缓存删除
        let images = getImagesFromCache();
        images = images.filter(image => image.id !== id);
        localStorage.setItem(CACHE_KEY, JSON.stringify(images));
        renderImagesFromCache();
        alert('图片删除成功（所有设备会同步更新）');
    } catch (error) {
        console.error('删除失败:', error);
        alert(`图片删除失败：${error.message}`);
    }
}

// ========== 11. 清空所有图片（已加 token） ==========
async function clearAllImages() {
    const images = getImagesFromCache();
    if (images.length === 0) {
        alert('暂无图片可清空');
        return;
    }

    if (!confirm('确认清空所有图片吗？GitHub 和所有设备都会同步删除，无法恢复！')) return;

    const githubConnected = await checkGithubConnection();

    try {
        // 1. 批量删除 GitHub 图片
        if (githubConnected) {
            const response = await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.imageDir}`);
            if (response.ok) {
                const files = await response.json();
                for (const file of files) {
                    await fetch(`${GITHUB_CONFIG.apiBaseUrl}/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${file.path}`, {
                        method: 'DELETE',
                        headers: {
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                            'Authorization': `token ${GITHUB_CONFIG.token}`
                        },
                        body: JSON.stringify({
                            message: `Delete all images`,
                            sha: file.sha,
                            branch: GITHUB_CONFIG.branch
                        })
                    });
                }
            }
        }

        // 2. 清空本地缓存
        localStorage.removeItem(CACHE_KEY);
        renderImagesFromCache();
        alert('已清空所有图片（GitHub 和所有设备同步更新）');
    } catch (error) {
        console.error('清空失败:', error);
        alert(`清空失败：${error.message}`);
    }
}

// ========== 12. 打开图片预览 ==========
function openImagePreview(url, name) {
    const previewWindow = window.open('', '_blank');
    previewWindow.document.write(`
        <html>
            <head>
                <title>预览：${name}</title>
                <style>
                    body { margin: 0; padding: 2rem; background: #f1f5f9; text-align: center; }
                    img { max-width: 90%; max-height: 90vh; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                </style>
            </head>
            <body>
                <img src="${url}" alt="${name}">
            </body>
        </html>
    `);
}
