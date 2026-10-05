export const CLAUDE_DENY = ['Bash(sudo:*)', 'Bash(git push:*)', 'Bash(git reset --hard:*)', 'Bash(git clean:*)', 'Bash(rm -rf /:*)', 'Bash(rm -rf ~:*)']
export const SAFE_COMMANDS = [
  'git status', 'git diff', 'git log', 'git show', 'ls', 'cat', 'mkdir',
  'npm', 'npx', 'pnpm', 'yarn', 'node', 'python', 'python3', 'pip', 'pytest', 'go', 'cargo', 'make',
]
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', '.niuma', 'target', '.pytest_cache', '.mypy_cache', '.playwright-mcp'])
