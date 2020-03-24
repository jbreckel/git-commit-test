const { Octokit } = require('@octokit/rest')
const openpgp = require('openpgp')

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
})

const run = async () => {
  const owner = 'jbreckel'
  const repo = 'git-commit-test'
  const branch = 'commit-test'

  const {
    data: {
      commit: { sha: branchSha },
    },
  } = await octokit.repos.getBranch({
    branch,
    owner,
    repo,
  })

  const {
    data: { sha: treeSha },
  } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: branchSha,
    tree: [
      {
        path: 'test.txt',
        mode: '100644',
        content: 'this is a test',
        type: 'blob',
      },
    ],
  })

  const date = new Date()

  const message = 'this is a test ' + date.getTime()

  const tzo = -0 //date.getTimezoneOffset()
  const dif = tzo >= 0 ? '+' : '-'
  const pad = num => {
    var norm = Math.floor(Math.abs(num))
    return (norm < 10 ? '0' : '') + norm
  }

  const commitInfo = `tree ${treeSha}
parent ${branchSha}
author Julius Breckel <julius.breckel@gmail.com> ${(date.getTime() / 1000).toFixed(0)} ${dif +
    pad(tzo / 60) +
    pad(tzo % 60)}
committer Julius Breckel <julius.breckel@gmail.com> ${(date.getTime() / 1000).toFixed(0)} ${dif +
    pad(tzo / 60) +
    pad(tzo % 60)}

${message}
`

  console.log(commitInfo)

  const {
    keys: [privateKey],
  } = await openpgp.key.readArmored(process.env.PRIVATE_KEY)
  // await privateKey.decrypt(process.env.PRIVATE_KEY_PASS);

  const { signature: detachedSignature } = await openpgp.sign({
    message: openpgp.cleartext.fromText(commitInfo), // CleartextMessage or Message object
    privateKeys: [privateKey], // for signing
    detached: true,
  })

  // openpgp has a version and comment in the signature that is not in the gpg signature
  const signature = detachedSignature
    .split('\n')
    .filter(line => !line.startsWith('Version') && !line.startsWith('Comment'))
    .join('\n')

  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message,
    author: {
      name: 'Julius Breckel',
      email: 'julius.breckel@gmail.com',
      date: date.toISOString(),
    },
    parents: [branchSha],
    tree: treeSha,
    signature,
  })
  console.log(commit)
  console.log('----')

  const data = await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/' + branch,
    sha: commit.data.sha,
  })

  console.log(data)
}

run().catch(console.log)
