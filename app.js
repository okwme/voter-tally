'use strict'
const axios = require('axios').default;
const {Bech32} = require('@cosmjs/encoding')
const fs = require('fs');
const { Worker, isMainThread, parentPort } = require('worker_threads');


console.log({Bech32})
const baseURL = 'https://api.cosmoscan.net'
axios.defaults.baseURL = baseURL
let voters = []
let allAccounts = {}
let allBalances = {}
let allTotalShares = {}
// const proposals = [
//   23, // 
// ]
async function start() {

  // let rawdata = fs.readFileSync('genesis.json');
  // genesis = JSON.parse(rawdata);


  // console.log(process.argv)
  const skip = process.argv.length > 2 && process.argv[2]
  let votes
  if (!skip) {
    // const val = 'cosmos102ruvpv2srmunfffxavttxnhezln6fnc3pf7tt'
    // const valoper = Bech32.encode('cosmosvaloper', Bech32.decode(val, 'cosmos').data)
    // console.log({valoper})
    // return
    // get list of all proposals to query
    const proposals = await getProposals()
    // const proposals = [49, 48]
    // console.log({proposals})

    // for each proposal
    // get a list of all votes and combine them into allvotes then make unique
    // format is:
    /*
    {
      voter: 'cosmos1pav2h84u4t80kf7ala2ss2j9umjussz7gt2vcz',
      is_validator: false
    }
    */
    await getVoters(proposals)


    let data = JSON.stringify(allAccounts, null, 2);
    fs.writeFileSync('pre-voters.json', data);
  } else {
    let rawdata = fs.readFileSync('pre-voters.json');
    allAccounts = JSON.parse(rawdata);

    // if (Array.isArray(foo)) {
    //   for(let i = 0; i < foo.length; i++) {
    //     let bar = foo[i]
    //     allAccounts[bar.voter] = bar.is_validator
    //   }
    // }
    // let data = JSON.stringify(allAccounts, null, 2);
    // fs.writeFileSync('pre-voters.json', data);
  }

  console.log(`initial count of votes, excluding delegators = ${Object.keys(allAccounts).length}`)

  // console.log({votes: votes.length})

  // get a list of all validators
  // take allvotes and find which voters are validators save as validatorvoters

  // pick a block height to base the airdrop off of
  // go through each validator and extract list of all delegators and add to allvotes then make unique
  // at this point it returns the original voter as just an address, plus all the delegators for each validator
  // await getDelegators()
  await workerBalances()
  console.log('workerBalances done!')

  // console.log({allBalances})
  // console.log({combinedvotes: votes.length})
  // console.log(votes[0])

  // let data = JSON.stringify(allAccounts);
  // fs.writeFileSync('all-accounts.json', data);
  // votes = [...new Set(votes)]

  // console.log({deduplicated: votes.length})
  let data = JSON.stringify(allBalances);
  fs.writeFileSync('all-balances.json', data);

  // go through each allvotes and get their balance at same block height
  // also go through each of the validators they are bonded to and get their share
  // also get the validator total shares
  // divide their share by total share and multiple by validator tokens
  // combine with account balance and save
}

// async function getDelegators() {
//   console.log('\ngetDelegators\n')
//   let voters = Object.keys(allAccounts)
//   console.log({voters: voters.length})
//   let results = []
//   let total = 0

//   for (let i = 0; i < voters.length; i++) {
//     const vote = voters[i]
//     if (allAccounts[vote]) {
//       getBalancesOfDelegators(vote)
//     } else {
//       getBalance(vote)
//     }
//   }
// }

async function workerBalances() {
  return new Promise((resolve, reject) => {
    let workers = new Set()
    let threads = 7
    voters = Object.keys(allAccounts)
    voters = voters.slice(0, 10)
    console.log(`total of ${voters.length} voters`)
    for (let i = 0; i < threads; i++) {
      let workerID = i;
      let worker = new Worker("./getBalances.js")
      workers.add(worker)
      let address = voters.pop()
      console.log(`number of voters after pop is ${voters.length}`)
      if (allAccounts[address]) {
        getBalancesOfDelegators(address)
      }

      worker.postMessage({address})

      worker.on("message", user => {
        console.log(`worker ${workerID} finished and there and ${voters.length} voters are left`)
        allBalances[user.address] = user.balance
        let total = Object.keys(allBalances).length
        console.log(workerID, `there are now ${total} voters recorded (all together there are ${total + voters.length})`)

        if (voters.length > 0) {
          let unique = false
          while(!unique) {
            if (voters.length == 0) {
              console.log(workerID, `voters.length == 0 (1)`)
              worker.postMessage('exit')
              break
            }
            address = voters.pop()
            console.log(`number of voters after pop is ${voters.length}`)

            // balance of this address has not been recorded
            if (!allBalances.hasOwnProperty(address)) {
              unique = true
            }
          }
          if (unique) {
            if (allAccounts[address]) {
              getBalancesOfDelegators(address)
            }
            worker.postMessage({address})
          }
        } else {
          console.log(workerID, `voters.length == 0 (2)`)
          worker.postMessage('exit')
        }
      })
      worker.on("error", code => {
        workers.delete(worker)
        console.log(`After deletion, there are ${workers.size} workers (1)`)
        reject(new Error(`Worker error with error code ${code}`))
      })
      worker.on('exit', code =>{
        console.log(`Worker stopped with exit code ${code}`)
        workers.delete(worker)
        console.log(`After deletion, there are ${workers.size} workers (2)`)
        if (workers.size == 0) {
          resolve()
        }
      })
    }
  })
}

function getBalancesOfDelegators(validator) {
  // return
  console.log(`\ngetBalancesofDelegators(${validator})\n`)
  let rawdata = fs.readFileSync('6746995.json');
  let genesis = JSON.parse(rawdata);
  const valoper = Bech32.encode('cosmosvaloper', Bech32.decode(validator, 'cosmos').data)
  const delegations = genesis.app_state.staking.delegations.filter(d => d.validator_address == valoper)
  console.log(`${delegations.length} new voters added`)
  voters = voters.concat(delegations.map(d => d.delegator_address))
}


// async function getValDelegators(address) {
//   console.log('getValDelegators')
//   const results = []
//   let rawdata = fs.readFileSync('6746995.json');
//   let genesis = JSON.parse(rawdata);
//   const valoper = Bech32.encode('cosmosvaloper', Bech32.decode(address, 'cosmos').data)
//   const delegations = genesis.app_state.staking.delegations.filter(d => d.validator_address == valoper)
//   console.log({delegations: delegations.length})
//   for (let i = 0; i < delegations.length; i++) {
//     results.push(delegations[i].delegator_address)
//   }

//   return results
// }

async function getVoters(proposals) {
  console.log('getVoters')
  let votes = []
  for (let i = 0; i < proposals.length; i++) {
    await getVotes(proposals[i])
  }
  // const result = [];
  // const map = new Map();
  // for (const item of votes) {
  //     if(!map.has(item.voter)){
  //         map.set(item.voter, true);    // set any value to Map
  //         result.push({
  //             voter: item.voter,
  //             is_validator: item.is_validator
  //         })
  //     }
  // }
  // return result 
}

async function getVotes(proposal_id, offset = 0, votes = []) {
  const limit = 1000
  const endpoint = 'proposals/votes'
  const chunk = await axios({
    method: 'get',
    url: endpoint,
    params: {
      proposal_id,
      // offset,
      // limit
    }
  }).catch(error=> {
    console.log({error})
  })
  if (!chunk.data) {
    return
  }

  for (let i = 0; i < chunk.data.length; i++) {
    let voter = chunk.data[i]
    allAccounts[voter.voter] = voter.is_validator
  }

  // votes = votes.concat(chunk.data)
  // if (chunk.data.length < limit) {
  //   return votes
  // } else {
  //   return getProposals(proposal_id, offset + limit, votes)
  // }
}

async function getProposals() {
  const endpoint = '/proposals/chart'
  const proposals = await axios.get(endpoint)
  console.log('total proposals', proposals.data.length)
  const quorum = proposals.data.filter(a => parseFloat(a.turnout) > 40).map(a => a.proposal_id)
  console.log('with quorum', quorum.length)
  return quorum
}

if (isMainThread) {
  start()
} else {

}

