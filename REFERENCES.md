# 参考与影响声明

本项目是一个独立开源的教学可视化项目。下面列出主要参考来源，以及明确的使用边界。

## 主要参考

1. Gilbert Strang, *Introduction to Linear Algebra*, 6th Edition, Wellesley-Cambridge Press, 2023. ISBN 978-1-7331466-7-8.
   - 作者主页与书籍信息：<https://math.mit.edu/~gs/linearalgebra/>
   - 用途：核对教学顺序、2×2 特例与数学事实；重点参考 Preface、向量与列空间、消元、四个子空间、特征值、应用章节。
2. Gilbert Strang, *Solutions to Problem Sets*（配套第六版）.
   - 用途：核对 2×2 特例与边界情况；不复制题目或解答。
3. MIT OpenCourseWare, 18.06 Linear Algebra.
   - <https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/>
   - 用途：理解课程脉络与常见误解。
4. 3Blue1Brown, *Essence of Linear Algebra*.
   - <https://www.3blue1brown.com/topics/linear-algebra>
   - 用途：视觉直觉的参照；不复制其脚本、分镜、动画、配色或旁白。

## 使用边界

- 本项目的中文文案、页面结构、交互、绘图与代码均为原创实现。
- 不复制、翻译或改写上述来源的正文、习题、解答、字幕、插图或动画。
- 数学事实与公式属于公共知识；具体表达、视觉设计与教学比喻由本项目自行完成。
- 本项目与 MIT、Gilbert Strang 教授、3Blue1Brown 均无隶属、合作或背书关系。

## 数学核对

当前测试覆盖 2×2 矩阵的：

- 行列式与面积：`|det(A)| = 底 × 高`
- 逆矩阵与奇异判定
- 秩—零空间定理：`rank + nullity = 2`
- 特征值、特征向量、复特征值与重根
- 线性方程组 `Ax = b`：唯一解、无解、无穷多解；`rank[A|b]` 与相容性
- 物理受力分解：非正交基上的系数、残差与共线退化
- 旋转、剪切、投影、反射、单位矩阵与零矩阵等特例

当前共 **45** 个测试。

运行方式：

```bash
node tests/math.test.js
```
