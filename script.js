// ========== 网盘配置（你的账号信息） ==========
const CLOUD_CONFIG = {
    baseUrl: 'https://ivo.lv.tab.digital/remote.php/dav/files/1297035851@qq.com/',
    username: '1297035851@qq.com',
    password: 'qsrT6-Nzeai-WoHND-JTDMf-NaBAQ',
    folder: 'image-gallery' // 网盘里专门存放图片的文件夹
};

// ========== 本地存储配置 ==========
const STORAGE_KEY = 'imageGalleryData';
// DOM元素
const fileUpload = document.getElementById('file-upload');
const imageGallery = document.getElementById('image-gallery');
const downloadAllBtn = document.getElementById('download-all');
const clearAllBtn = document.getElementById('clear-all');
const syncCloudBtn = document.getElementById('sync-cloud');
const cloudStatus = document.getElementById('cloud-status');

// 初始化
init();

// ========== 1. 初始化函数 ==========
async function init() {
    // 绑定事件
    fileUpload.addEventListener('change', handleFileUpload);
    downloadAllBtn.addEventListener('click', downloadAllImages);
    clearAllBtn.addEventListener('click', clearAllImages);
    syncCloudBtn.addEventListener('click', syncFromCloud);

    // 先检测网盘连接
    await checkCloudConnection();
    
    // 优先从网盘加载图片
    await loadImagesFromCloud();
    
    // 本地存储兜底
    if (getImagesFromStorage().length === 0) {
        renderImages();
    }
}

// ========== 2. 网盘连接检测 ==========
async function checkCloudConnection() {
    try {
        cloudStatus.className = 'status loading';
        cloudStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在连接网盘...';
        
        // 发送OPTIONS请求检测连接
        const response = await fetch(CLOUD_CONFIG.baseUrl, {
            method: 'OPTIONS',
            headers: {
                'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password)
            }
        });

        if (response.ok) {
            // 创建图片专用文件夹
            await createCloudFolder();
            
            cloudStatus.className = 'status success';
            cloudStatus.innerHTML = '<i class="fas fa-check"></i> 网盘连接成功（跨设备同步已开启）';
            return true;
        } else {
            throw new Error('连接失败');
        }
    } catch (error) {
        cloudStatus.className = 'status error';
        cloudStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 网盘连接失败，仅启用本地存储';
        console.error('网盘连接失败:', error);
        return false;
    }
}

// ========== 3. 创建网盘文件夹 ==========
async function createCloudFolder() {
    try {
        const folderUrl = CLOUD_CONFIG.baseUrl + CLOUD_CONFIG.folder + '/';
        await fetch(folderUrl, {
            method: 'MKCOL',
            headers: {
                'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password)
            }
        });
    } catch (error) {
        // 文件夹已存在时忽略错误
        if (!error.message.includes('405')) {
            console.warn('创建文件夹失败:', error);
        }
    }
}

// ========== 4. 处理文件上传（同步网盘） ==========
async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files.length) return;

    // 先检测网盘连接
    const cloudConnected = await checkCloudConnection();

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // 校验文件
        if (!file.type.startsWith('image/')) {
            alert('请上传图片格式文件（JPG/PNG/GIF）');
            continue;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('单张图片大小不能超过5MB');
            continue;
        }

        const reader = new FileReader();
        reader.onload = async function (e) {
            const imageId = Date.now() + i;
            const fileName = `${imageId}_${file.name}`;
            const imageData = {
                id: imageId,
                name: file.name,
                fileName: fileName, // 网盘存储的文件名
                url: e.target.result,
                size: (file.size / 1024).toFixed(2) + 'KB',
                time: new Date().toLocaleString()
            };

            // 1. 保存到本地
            saveImageToStorage(imageData);

            // 2. 同步到网盘（如果连接成功）
            if (cloudConnected) {
                await uploadToCloud(file, fileName);
            }

            // 3. 重新渲染
            renderImages();
        };
        reader.readAsDataURL(file);
    }

    fileUpload.value = '';
}

// ========== 5. 上传文件到网盘 ==========
async function uploadToCloud(file, fileName) {
    try {
        const uploadUrl = CLOUD_CONFIG.baseUrl + CLOUD_CONFIG.folder + '/' + fileName;
        await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password),
                'Content-Type': file.type
            },
            body: file
        });
        console.log('上传到网盘成功:', fileName);
    } catch (error) {
        console.error('上传到网盘失败:', error);
        alert(`图片${file.name}本地保存成功，但网盘同步失败！`);
    }
}

// ========== 6. 从网盘加载图片 ==========
async function loadImagesFromCloud() {
    try {
        const cloudConnected = await checkCloudConnection();
        if (!cloudConnected) return;

        // 获取网盘文件列表
        const folderUrl = CLOUD_CONFIG.baseUrl + CLOUD_CONFIG.folder + '/';
        const response = await fetch(folderUrl, {
            method: 'PROPFIND',
            headers: {
                'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password),
                'Depth': '1'
            }
        });

        if (!response.ok) throw new Error('获取网盘文件失败');

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // 解析文件列表
        const responseElements = xmlDoc.getElementsByTagName('d:response');
        const images = [];

        for (let i = 0; i < responseElements.length; i++) {
            const elem = responseElements[i];
            const href = elem.getElementsByTagName('d:href')[0].textContent;
            
            // 过滤文件夹和非图片文件
            if (href.endsWith('/') || !href.includes('_')) continue;
            if (!href.match(/\.(jpg|jpeg|png|gif)$/i)) continue;

            // 解析文件名和信息
            const fileName = href.split('/').pop();
            const [imageId, ...nameParts] = fileName.split('_');
            const originalName = nameParts.join('_');
            
            // 获取图片URL（带认证）
            const imageUrl = folderUrl + fileName;
            const authImageUrl = `data:application/octet-stream;base64,${btoa(JSON.stringify({
                url: imageUrl,
                user: CLOUD_CONFIG.username,
                pass: CLOUD_CONFIG.password
            }))}`;

            images.push({
                id: parseInt(imageId),
                name: originalName,
                fileName: fileName,
                url: imageUrl, // 网盘地址
                size: '未知', // 如需获取大小需额外解析XML
                time: new Date().toLocaleString()
            });
        }

        // 保存到本地存储
        if (images.length > 0) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
            renderImages();
        }

    } catch (error) {
        console.error('从网盘加载图片失败:', error);
    }
}

// ========== 7. 手动同步网盘 ==========
async function syncFromCloud() {
    cloudStatus.className = 'status loading';
    cloudStatus.innerHTML = '<i class="fas fa-sync fa-spin"></i> 正在同步网盘图片...';
    
    await loadImagesFromCloud();
    
    cloudStatus.className = 'status success';
    cloudStatus.innerHTML = '<i class="fas fa-check"></i> 网盘同步完成！';
    
    // 3秒后恢复默认状态
    setTimeout(async () => {
        await checkCloudConnection();
    }, 3000);
}

// ========== 8. 下载单张图片（支持网盘文件） ==========
async function downloadSingleImage(image) {
    // 如果是网盘图片，直接下载网盘地址
    if (image.url.startsWith('https://ivo.lv.tab.digital')) {
        try {
            const response = await fetch(image.url, {
                headers: {
                    'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password)
                }
            });
            const blob = await response.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = image.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
        } catch (error) {
            console.error('下载网盘图片失败:', error);
            alert('网盘图片下载失败，尝试本地下载！');
            // 降级为本地Base64下载
            const a = document.createElement('a');
            a.href = getImagesFromStorage().find(item => item.id === image.id)?.url || image.url;
            a.download = image.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    } else {
        // 本地图片直接下载
        const a = document.createElement('a');
        a.href = image.url;
        a.download = image.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// ========== 9. 删除图片（同步删除网盘） ==========
async function deleteSingleImage(id) {
    if (!confirm('确认删除这张图片吗？删除后本地和网盘都会移除！')) return;

    // 获取图片信息
    const images = getImagesFromStorage();
    const image = images.find(item => item.id === id);
    if (!image) return;

    // 1. 从网盘删除
    if (image.fileName && await checkCloudConnection()) {
        try {
            const deleteUrl = CLOUD_CONFIG.baseUrl + CLOUD_CONFIG.folder + '/' + image.fileName;
            await fetch(deleteUrl, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password)
                }
            });
        } catch (error) {
            console.error('删除网盘图片失败:', error);
            alert('本地图片已删除，但网盘图片删除失败，请手动清理！');
        }
    }

    // 2. 从本地删除
    const newImages = images.filter(item => item.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newImages));
    
    // 3. 重新渲染
    renderImages();
}

// ========== 10. 原有核心函数（兼容保留） ==========
// 保存到本地存储
function saveImageToStorage(imageData) {
    const images = getImagesFromStorage();
    images.push(imageData);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
}

// 从本地存储获取
function getImagesFromStorage() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

// 渲染图片列表
function renderImages() {
    const images = getImagesFromStorage();
    imageGallery.innerHTML = '';

    if (images.length === 0) {
        imageGallery.innerHTML = '<div class="empty-tip">暂无图片，点击上传按钮添加</div>';
        return;
    }

    images.forEach(image => {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.innerHTML = `
            <img src="${image.url}" alt="${image.name}" class="image-preview" title="点击查看大图">
            <div class="image-actions">
                <div class="download-btn" data-id="${image.id}">
                    <i class="fas fa-download"></i> 下载
                </div>
                <div class="delete-btn" data-id="${image.id}">
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
        card.querySelector('.delete-btn').addEventListener('click', () => deleteSingleImage(image.id));
    });
}

// 打开图片预览
function openImagePreview(url, name) {
    // 如果是网盘图片，带认证预览
    if (url.startsWith('https://ivo.lv.tab.digital')) {
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
                    <img src="${url}" alt="${name}" 
                         onload="this.style.display='block'"
                         onerror="this.src='https://cdn.bootcdn.net/ajax/libs/font-awesome/6.4.0/svg/solid/image.svg'; this.style.width='100px'">
                </body>
            </html>
        `);
        // 设置认证头（需浏览器支持，部分浏览器可能无法预览，降级为下载）
    } else {
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
}

// 批量下载所有图片
async function downloadAllImages() {
    const images = getImagesFromStorage();
    if (images.length === 0) {
        alert('暂无图片可下载');
        return;
    }

    if (confirm(`确认下载全部${images.length}张图片？`)) {
        for (let i = 0; i < images.length; i++) {
            await downloadSingleImage(images[i]);
            // 延迟避免浏览器拦截
            if (i < images.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        alert(`已开始下载全部${images.length}张图片，请查收浏览器下载列表`);
    }
}

// 清空所有图片
async function clearAllImages() {
    const images = getImagesFromStorage();
    if (images.length === 0) {
        alert('暂无图片可清空');
        return;
    }

    if (!confirm('确认清空所有图片吗？本地和网盘的图片都会被删除，且无法恢复！')) return;

    // 1. 批量删除网盘图片
    if (await checkCloudConnection()) {
        for (const image of images) {
            if (image.fileName) {
                try {
                    const deleteUrl = CLOUD_CONFIG.baseUrl + CLOUD_CONFIG.folder + '/' + image.fileName;
                    await fetch(deleteUrl, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Basic ' + btoa(CLOUD_CONFIG.username + ':' + CLOUD_CONFIG.password)
                        }
                    });
                } catch (error) {
                    console.error('删除网盘图片失败:', error);
                }
            }
        }
    }

    // 2. 清空本地存储
    localStorage.removeItem(STORAGE_KEY);
    renderImages();
    alert('已清空所有图片（本地+网盘）');
}
