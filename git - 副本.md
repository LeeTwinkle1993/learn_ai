git 仓库初始化 会生成.git文件
git init
 
 
提交所有文件 add . 
git add .
# 提交对应文件
git add git.md



# 对提交的记录进行说明解释 
## feat：新增功能
## fix：修复问题
## docs：文档修改
## style：格式调整
## refactor：代码重构
## test：测试相关
git commit -m "修复登录接口超时问题"

# 切换分支
git branch -M main

# 关联 GitHub 远程仓库（把地址换成你的仓库）
git remote add origin https://github.com/LeeTwinkle1993/learn_ai.git
# 验证关联是否成功
git remote -v 


# 把本地仓库代码提交到 远程仓库的分支main
git push -u origin main



# 检查本地主机是否已经存在ssh key
cd ~/.ssh
ls
# 如果存在直接获取，不存在则重新生成
ssh-keygen -t rsa -C 'xx@xxx.com'
cd ~/.ssh
ls 
cat id_rsa.pub 
# 查看是ssh密钥否配置成功
ssh -T git@github.com


# 拉取github 分支main上的代码
git pull origin main


# 拷贝mian分支的代码 并重命名为learn_git
git clone -b main  https://github.com/用户名/仓库名.git learn_git


# 查看仓库状态
git status


# 查看git提交历史记录
git log



