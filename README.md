## Collect gov addresses

Take the proposal number and find out the last block a vote came in (visible on mintscan block explorer). Use this block height as the `--height` param in the query for the votes. Query 1000 at a time so you only need to do ~10 or less queries and save them in individual json files.
```bash
> gaiad q gov votes 59 --height 8681619 --page 1 --limit 1000 > 59-1.json && jq '.votes | length' 59-1.json
```
Combine them using `jq` into a single file
```bash
> jq -n '{ votes: [ inputs.votes ] | add }' 59-1.json 59-2.json 59-3.json 59-4.json 59-5.json 59-6.json 59-7.json > 59.json
```
Make sure they're all there
```bash
> jq '.votes | length' 59.json
```
Find out which of the voters were validators

First get a list of validators at the final vote height and confirm the total with `jq`
```bash
> gaiad q staking validators --height 8681619 --limit 500 > 59-validators.json && jq '.validators | length' 59-validators.json
```
Get a list of all of the validators that voted and append them into a new txt file

```bash
> echo "" > 59-validator-voters.txt
> for row in $(cat 59-validators.json | jq -r '.validators[].operator_address'); do
        grep -o $(gaiad keys parse $(gaiad keys parse ${row} --output json | jq -r '.bytes') --output json | jq -r '.formats[0]') 59.json >> 59-validator-voters.txt
done
```
get the list of delegators from each voting validator for that block height

> UH OH: This query doesn't seem to be working on any node i'm using.... I'm afraid the query is too innefficent to actually be used. Furthermore it looks like the timeout makes it unsuitable for bash loops. Maybe need to put all of this into node or python scripts that can wait for http responses before making subsequent queries?

```bash
> while read -r line; do
    echo "gaiad q staking delegations-to $(gaiad keys parse $(gaiad keys parse $line --output json | jq -r '.bytes') --output json | jq -r '.formats[2]') --height 8681619 --limit 10"
done < 59-validator-voters.txt
```

---

actually we want to be using `6746995` height for the proposal `49`

so we got the genesis file of the `cosmoshub-4` at height `6746995`, exported using `gaia v4.x.x` and named `6746995.json` (thanks @jackzampolin!).

Now let's export the voters of proposal 49 to `6746995-49-voters.txt`
```bash
> jq -r '.app_state.gov.votes[] | select(.proposal_id=="49") | .voter' 6746995.json > 6746995-49-voters.txt
```

Now let's get a list of validators from this genesis file
```bash
> jq -r '.validators[].address' 6746995.json > 6746995-validators.txt
```

Now record which validators voted after clearing the file
```bash
> > 6746995-validator-voters.txt
```

```bash
while read -r line; do
    grep -o $(gaiad keys parse $line --output json | jq -r '.formats[0]') 6746995-49-voters.txt >> 6746995-validator-voters.txt
done < 6746995-validators.txt
```

This resulted in an empty set of greps which seems strange. I think the keys (which were in byte format) were the consensus_pubkeys or something. So I'm gonna pull out new keys from the `app_state` section of the `staking` module and replace the original validators file.
```bash
jq -r '.app_state.staking.validators[].operator_address' 6746995.json > 6746995-validators.txt
```
These will need to be reformatted before the grep so will be a slightly different command as before
```bash
> while read -r line; do
    grep -o $(gaiad keys parse $(gaiad keys parse $line --output json | jq -r '.bytes') --output json | jq -r '.formats[0]') 6746995-49-voters.txt >> 6746995-validator-voters.txt
done < 6746995-validators.txt
```

Now we need to get all the delegators of each of the voting validators.

```bash
while read -r line; do
  valoper=$(gaiad keys parse $(gaiad keys parse $line --output json | jq -r '.bytes') --output json | jq -r '.formats[2]')
  jq -r --arg valoper "$valoper" '.app_state.staking.delegations[] | select(.validator_address==$valoper) | .delegator_address' 6746995.json >> 6746995-validator-voter-delegators.txt
done < 6746995-validator-voters.txt
```

now that we have them all in a file let's add the original validator addresses and then make a unique file

```bash
cat 6746995-validator-voter-delegators.txt 6746995-validator-voters.txt > 6746995-49-all-voters-tmp.txt
```

make them unique

```bash
sort -u 6746995-49-all-voters-tmp.txt > 6746995-49-all-voters.txt
```

now extract the token balance for each address and add put it all in a new txt file (skipping the 0 balance addresses)

```bash
while read -r line; do
  amount=$(jq -r --arg line "$line" '.app_state.bank.balances[] | select(.address==$line) | .coins[] | select(.denom=="uatom") | .amount' 6746995.json)
  if [ $amount != "" ]
  then
    echo "$line $amount" >> 6746995-49-all-voters-balances.txt
  fi
done < 6746995-49-all-voters.txt
```

or try breaking them up in multiple processes so it won't take so long?

```bash
sed -n '1,5p;6q' 6746995-49-all-voters.txt | while read -r line; do
  amount=$(jq -r --arg line "$line" '.app_state.bank.balances[] | select(.address==$line) | .coins[] | select(.denom=="uatom") | .amount' 6746995.json)
  echo "$line $amount" >> 6746995-49-all-voters-balances-1-10000.txt
done
```

OK previous attempt to break up into chunks resulted in making a bash file that accepts arguments. It looks like this:
```bash
#!/bin/bash

> 6746995-49-all-voters-balances-${1}-${2}.txt
sedcommand="$1,$2p;$(($2 + 1))q"
sed -n $sedcommand 6746995-49-all-voters.txt | while read -r line; do
  amount=$(jq -r --arg line "$line" '.app_state.bank.balances[] | select(.address==$line) | .coins[] | select(.denom=="uatom") | .amount' 6746995.json)
  if [ "$amount" != "" ]; then
    echo "$line $amount" >> 6746995-49-all-voters-balances-${1}-${2}.txt
  fi
done
```

I spun up a server with 32 cores and so split the total amount of addresses (66622) so that it would be processed in chunks of 2,500. These are the commands running on the server to do so:
```bash
root@tmp-airdrop-workhorse:~# ./get-balances.sh 1 2500 &!
[1] 15008
root@tmp-airdrop-workhorse:~# ./get-balances.sh 2501 5000 &!
[2] 15014
root@tmp-airdrop-workhorse:~# ./get-balances.sh 5001 7500 &!
[3] 15023
root@tmp-airdrop-workhorse:~# ./get-balances.sh 7501 10000 &!
[4] 15035
root@tmp-airdrop-workhorse:~# ./get-balances.sh 10001 12500 &!
[5] 15060
root@tmp-airdrop-workhorse:~# ./get-balances.sh 12501 15000 &!
[6] 15077
root@tmp-airdrop-workhorse:~# ./get-balances.sh 15001 17500 &!
[7] 15090
root@tmp-airdrop-workhorse:~# ./get-balances.sh 17501 20000 &!
[8] 15150
root@tmp-airdrop-workhorse:~# ./get-balances.sh 20001 22500 &!
[9] 15167
root@tmp-airdrop-workhorse:~# ./get-balances.sh 22501 25000 &!
[10] 15197
root@tmp-airdrop-workhorse:~# ./get-balances.sh 25001 27500 &!
[11] 15216
root@tmp-airdrop-workhorse:~# ./get-balances.sh 27501 30000 &!
[12] 15245
root@tmp-airdrop-workhorse:~# ./get-balances.sh 30001 32500 &!
[13] 15280
root@tmp-airdrop-workhorse:~# ./get-balances.sh 32501 35000 &!
[14] 15322
root@tmp-airdrop-workhorse:~# ./get-balances.sh 35001 37500 &!
[15] 15355
root@tmp-airdrop-workhorse:~# ./get-balances.sh 37501 40000 &!
[16] 15388
root@tmp-airdrop-workhorse:~# ./get-balances.sh 40001 42500 &!
[17] 15421
root@tmp-airdrop-workhorse:~# ./get-balances.sh 42501 45000 &!
[18] 15452
root@tmp-airdrop-workhorse:~# ./get-balances.sh 45001 47500 &!
[19] 15484
root@tmp-airdrop-workhorse:~# ./get-balances.sh 47501 50000 &!
[20] 15520
root@tmp-airdrop-workhorse:~# ./get-balances.sh 50001 52500 &!
[21] 15549
root@tmp-airdrop-workhorse:~# ./get-balances.sh 52501 55000 &!
[22] 15592
root@tmp-airdrop-workhorse:~# ./get-balances.sh 55001 57500 &!
[23] 15628
root@tmp-airdrop-workhorse:~# ./get-balances.sh 57501 60000 &!
[24] 15662
root@tmp-airdrop-workhorse:~# ./get-balances.sh 60001 62500 &!
[25] 15699
root@tmp-airdrop-workhorse:~# ./get-balances.sh 62501 65000 &!
[26] 15730
```

OK now that they're all correlated they can be combined like this:
```bash
cat 6746995-49-all-voters-balances-* > 6746995-49-all-voters-balances.txt
```

Now i'd like to know the total number of atoms represented:
```bash
i=0
while read -r line; do
  atom=${line:46:-1}
  i=$((i + atom))
done < 6746995-49-all-voters-balances.txt
echo $i
```

And we get the total number of atoms as `726187270604uatom` or `726,187.270604 atoms` out of a current circulating supply of `285,687,627 atoms`.

OK this is way too few I forgot to get the amount of tokens each address has delegated too 🤦‍♂️

I think to do that I need to get each validator that the account is delegating to, get their `shares` and divide that by the total `delegator_shares` and then multiply that by the validator `tokens`. fml.

```bash
#!/bin/bash

> 6746995-49-all-voters-balances-${1}-${2}.txt
sedcommand="$1,$2p;$(($2 + 1))q"
sed -n $sedcommand 6746995-49-all-voters.txt | while read -r line; do
  amount=$(jq -r --arg line "$line" '.app_state.bank.balances[] | select(.address==$line) | .coins[] | select(.denom=="uatom") | .amount' 6746995.json)
  if [ "$amount" != "" ]; then
    echo "$line $amount" >> 6746995-49-all-voters-balances-${1}-${2}.txt
  fi
done
```

OK so cosmoscan.net has an active API that includes votes as early as prop 23. Maybe I should start this again with an actual app that will query and run these. Python or Node? I'm faster with node....

