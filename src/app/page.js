// ... 前面代码保持不变 ...

  const handleDeleteBatch = async () => {
    if (selectedImageIds.length === 0) return toast.warn("请先选择图片");
    if (!confirm(`确定要删除选中的 ${selectedImageIds.length} 张图片吗？`)) return;

    setUploading(true);
    try {
      const res = await fetch('/api/enableauthapi/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedImageIds })
      });
      if (res.ok) {
        // 删除成功后，从界面移除
        setUploadedImages(prev => prev.filter(img => !selectedImageIds.includes(img.id)));
        setSelectedImageIds([]);
        setIsManageMode(false);
        toast.success("成功从数据库移除记录");
      } else {
        toast.error("删除失败：请检查数据库绑定名是否为 IMG");
      }
    } catch (e) { toast.error("网络请求失败"); }
    setUploading(false);
  };

// --- 渲染 Gifyu 风格布局 ---
return (
  // ... 顶部代码 ...
  <div className="space-y-8 mt-10">
    {uploadedImages.map((img, i) => (
      <div key={img.id || i} className="bg-white p-6 rounded-3xl border border-slate-100 flex flex-col md:flex-row gap-6 shadow-sm">
        {/* 左侧预览与选中 */}
        <div 
          className="w-full md:w-40 h-40 rounded-2xl overflow-hidden relative cursor-pointer border-2 border-white shadow-inner"
          onClick={() => isManageMode && toggleSelectImage(img.id)}
        >
          <img src={img.url} className="w-full h-full object-cover" />
          {isManageMode && (
            <div className="absolute top-2 left-2 bg-white/80 rounded p-1">
              <FontAwesomeIcon icon={selectedImageIds.includes(img.id) ? faCheckSquare : faSquare} className="text-blue-500 text-lg" />
            </div>
          )}
        </div>

        {/* 右侧垂直外链列表 - 参照 Gifyu 布局 */}
        <div className="flex-1 space-y-3">
          <LinkItem label="图片链接" value={img.url} />
          <LinkItem label="HTML" value={`<img src="${img.url}" />`} />
          <LinkItem label="BBCode" value={`[img]${img.url}[/img]`} />
          <LinkItem label="Markdown" value={`![image](${img.url})`} />
          <LinkItem label="图片URL链接" value={img.url} />
        </div>
      </div>
    ))}
  </div>
);
