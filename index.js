
const yaml = require('js-yaml');
const fs   = require('fs');
const axios = require('axios')

const argv = require('minimist')(process.argv.slice(2));

const PNPM_FILE = argv['file']
const SNYK_TOKEN = argv['snyk-token']
const ORG_ID = argv['org']

const depGraph = {
  depGraph: {
    schemaVersion: "1.2.0",
    pkgManager: {
      name: "npm"
    },
    pkgs: [],
    graph: {
      rootNodeId: "root-node",
      nodes: []
    }
  }
}

let pnpmLock = {}
let pkgs = []
let nodes = []

try {
  pnpmLock = yaml.load(fs.readFileSync(PNPM_FILE, 'utf8'));
} catch (e) {
  console.log(e);
}

const rootNode = {
  nodeId: "root-node",
  pkgId: "pnpm-app@1.0.0",
  deps: []
}

const rootPkg = {
  id: "pnpm-app@1.0.0",
  info: {
    name: "pnpm-app",
    version: "1.0.0"
  }
}

pkgs.push(rootPkg)
nodes.push(rootNode)

const rootNodeDeps = []

// top level projects
for (let importerKey of Object.keys(pnpmLock.importers)) {
  const importer = pnpmLock.importers[importerKey]
  const dependencies = importer.dependencies ? importer.dependencies: {}

  const name = importerKey
  const version = "1.0.0"
  const pkgId = `${name}@${version}`

  rootNodeDeps.push({
    nodeId: pkgId
  })

  // Create pkg (flat list of depedencies for dep graph)
  const pkg = {
    id: pkgId,
    info: {
      name: name,
      version: version
    }
  }

  pkgs.push(pkg)

  // Create node (defines edges of graph)
  const deps = []
  Object.keys(dependencies).forEach((key) => {
    const version = dependencies[key]
    if (!version.includes("link") && !version.includes("link")) {
      deps.push({
        nodeId: `${key}@${version}`
      })
    }
  })

  const node = {
    nodeId: pkgId,
    pkgId: pkgId,
    deps: deps
  }

  nodes.push(node)
}

rootNode.deps = rootNodeDeps

// dependency parsing
for (let packageKey of Object.keys(pnpmLock.packages)) {
  const package = pnpmLock.packages[packageKey]

  if (package.dev) {
    continue;
  }

  const dependencies = package.dependencies ? package.dependencies: {}

  const name = packageKey.substring(1, packageKey.lastIndexOf("/"))
  const version = packageKey.substring(packageKey.lastIndexOf("/") + 1)
  const pkgId = `${name}@${version}`

  // Create pkg (flat list of depedencies for dep graph)
  const pkg = {
    id: pkgId,
    info: {
      name: name,
      version: version
    }
  }

  pkgs.push(pkg)

  // Create node (defines edges of graph)
  const deps = Object.keys(dependencies).map((key) => {
    const version = dependencies[key]
    return {
      nodeId: `${key}@${version}`
    }
  })

  const node = {
    nodeId: pkgId,
    pkgId: pkgId,
    deps: deps
  }

  nodes.push(node)

  // console.log(packageKey + " -> " + name, version)
}

depGraph.depGraph.pkgs = pkgs
depGraph.depGraph.graph.nodes = nodes

fs.writeFile("pnpm-depgraph.json", JSON.stringify(depGraph, null, 2), (err) => {
 
  // Catching error
  if (err) {
      console.log(err);
  }
});

axios.post(`https://api.snyk.io/api/v1/monitor/dep-graph?org=${ORG_ID}`, depGraph, {
  headers: { 
    'Authorization': `${SNYK_TOKEN}`, 
    'Content-Type': 'application/json'
  }
}).then(res => {
  console.log(res.data)
}).catch(err => {
  console.log(err)
})