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

  // build the git internal commit to sign it as payload
  const commitInfo = `tree ${treeSha}
parent ${branchSha}
author Julius Breckel <julius.breckel@gmail.com> ${Math.floor(date.getTime() / 1000)} +0000
committer Julius Breckel <julius.breckel@gmail.com> ${Math.floor(date.getTime() / 1000)} +0000

${message}`

  const {
    keys: [privateKey],
  } = await openpgp.key.readArmored(process.env.PRIVATE_KEY)

  const { signature: detachedSignature } = await openpgp.sign({
    message: openpgp.cleartext.fromText(commitInfo), // CleartextMessage or Message object
    privateKeys: [privateKey], // for signing
    detached: true,
  })

  const signature = detachedSignature

  const commit = await octokit.git.createCommit({
    owner,
    repo,
    message,
    author: {
      name: 'Julius Breckel',
      email: 'julius.breckel@gmail.com',
      date: date.toISOString(),
    },
    committer: {
      name: 'Julius Breckel',
      email: 'julius.breckel@gmail.com',
      date: date.toISOString(),
    },
    parents: [branchSha],
    tree: treeSha,
    signature,
  })

  const data = await octokit.git.updateRef({
    owner,
    repo,
    ref: 'heads/' + branch,
    sha: commit.data.sha,
  })

  // commit keeps being unverified as the signing somehow is not what git expects
  console.log(commit)
  const { signatures } = await openpgp.verify({
    message: openpgp.cleartext.fromText(commit.data.verification.payload), // CleartextMessage or Message object
    signature: await openpgp.signature.readArmored(commit.data.verification.signature), // parse detached signature
    publicKeys: (await openpgp.key.readArmored(process.env.PUBLIC_KEY)).keys, // for verification
  })
  const { valid, keyid } = signatures[0]
  if (valid) {
    console.log('signed by key id ' + keyid.toHex())
  } else {
    throw new Error('signature could not be verified')
  }
}

run().catch(console.log)
