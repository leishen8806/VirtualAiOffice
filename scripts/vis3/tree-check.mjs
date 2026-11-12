// 工作树隔离检查：运行后再次比较整库工作树状态。
import { execFileSync } from 'node:child_process'

export function compareRepoClean(repo, before) {
  const repoCleanAfter = execFileSync('git', ['-C', repo, 'status', '--porcelain'], { encoding: 'utf8' }).trim()
  return { repoCleanBefore: before, repoCleanAfter, unchanged: before === repoCleanAfter }
}
