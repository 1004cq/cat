# cat

把粉球甩出去，白猫会跑去叼回来。

## 玩法

1. 按住球并拖动
2. 松手扔出
3. 猫追上、叼住、跑回起点，计数 +1

手机和电脑都能玩。必须用 HTTP 打开（本地静态服务或 Pages）。直接双击 HTML 时，3D 模块不会加载。

## 操作

| 操作 | 效果 |
| --- | --- |
| 拖球 | 瞄准 |
| 松手 | 带重力、弹跳的投掷 |
| 等待 | 猫捡回并加分 |

## 文件

```
index.html   页面
style.css    布局
game.js      WebGL 场景和物理
grass.jpg    草地贴图
cat.jpg      猫咪贴图
```

`grass.jpg` 和 `cat.jpg` 与 `index.html` 放在同一目录。

## 本地运行

```bash
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`。

## 技术

- Three.js（WebGL）
- 固定 60Hz 物理步进
- 球静止后休眠
- 投掷速度取松手前一小段指针均值
- 页面不可见时暂停
