# Add upstream remote (once)
git remote add upstream https://github.com/umami-software/umami.git

# Fetch latest upstream
git fetch upstream

# Rebase our commits on top of upstream main
git rebase upstream/master
