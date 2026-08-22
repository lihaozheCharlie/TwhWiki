# Security Policy

## Supported versions

当前仅维护最新发布版本。

## Reporting a vulnerability or privacy leak

请不要在公开 Issue 中发布令牌、个人日记、联系方式、真实姓名映射或其他敏感数据。使用仓库维护者提供的私密安全联系方式，并说明受影响文件、复现方式和建议的缓解措施。

本项目最主要的风险不是远程代码执行，而是私人知识库被误提交。发布前请运行：

```bash
python3 tools/privacy_scan.py
git status --short
```

隐私扫描只是最低保障，不能替代人工逐文件复核和 Git 历史检查。
