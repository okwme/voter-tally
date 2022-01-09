const { workerData, parentPort, isMainThread } = require("worker_threads");
const fs = require('fs');

parentPort.on("message", address => {
    if (address == "exit") {
      parentPort.close();
    }
    let balance = getBalance(address)
    parentPort.postMessage({address,balance});
});


// start the worker, get the balance
// when balance is found, return it to main thread
// update the offset and proceed
// in main thread it will be added to all balances



function getBalance(address) {
  console.log(`getBalance(${address})`)
  // if (allBalances.hasOwnProperty(address)) {
  //   console.log(`${address} already in allBalances`)
  //   return
  // }
  let balance = 0
  let rawdata = fs.readFileSync('6746995.json');
  let genesis = JSON.parse(rawdata)
  let balances = genesis.app_state.bank.balances.filter(a => a.address == address)
  if (balances.length == 0) {
    new Error(`balances of account ${address} are empty`)
  }
  if (balances[0].hasOwnProperty('coins')){
    let uatoms = balances[0].coins.filter(a => a.denom == 'uatom')
    if (uatoms.length > 0) {
      balance += parseInt(uatoms[0])
    }
  }
  let allTotalShares = {}
  let delegations = genesis.app_state.staking.delegations.filter(d => d.delegator_address == address)
  for (let i = 0; i < delegations.length; i++) {
    let delegation = delegations[i]
    let validator = delegation.validator_address
    let shares = delegation.shares
    // if (!allTotalShares.hasOwnProperty(validator)) {
      let valinfo = genesis.app_state.staking.validators.find(v => v.operator_address == validator)
      if(!valinfo) {
        new Error(`${validator} not found in genesis.app_state.staking.validators`)
      }
      allTotalShares[validator] = {
        totalShares: valinfo.delegator_shares,
        tokens: valinfo.tokens
      }
    // }
    let totalShares = allTotalShares[validator].totalShares
    let tokens = allTotalShares[validator].tokens
    let shareBalance = (parseFloat(shares) / parseFloat(totalShares)) * tokens
    balance += parseInt(shareBalance)
  }
  // allBalances[address] = balance
  // console.log(`allBalances = ${Object.keys(allBalances).length}`)
  return balance
}