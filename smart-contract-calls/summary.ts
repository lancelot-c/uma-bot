import { postOnDiscord, getDirectories } from '../test/utils';
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createPublicEthClient, getCurrentPhase, logError, ZERO_ADDRESS, getDelegateAddresses, TransactionHash, createRedisInstance } from './common';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type DelegateTransaction = [delegateAddress: `0x${string}`, transactionHash: TransactionHash]

const skippedWalletsFolder = path.join(__dirname, './../test-data/skipped')
console.log(`> Attempting to get folders inside ${skippedWalletsFolder}`)
let skippedFolders: Array<string> = await getDirectories(skippedWalletsFolder)
console.log(`skippedFolders: `, skippedFolders)

const successfulWalletsFolder = path.join(__dirname, './../test-data/successful')
console.log(`> Attempting to get folders inside ${successfulWalletsFolder}`)
let successfulFolders: Array<string> = await getDirectories(successfulWalletsFolder)
let successfulTransactions: DelegateTransaction[] = successfulFolders.map(f => f.split(':') as DelegateTransaction)
console.log(`successfulFolders: `, successfulFolders)
console.log(`successfulTransactions: `, successfulTransactions)

const failedWalletsFolder = path.join(__dirname, './../test-data/failed')
console.log(`> Attempting to get folders inside ${failedWalletsFolder}`)
let failedFolders: Array<string> = await getDirectories(failedWalletsFolder)
let failedTransactions: DelegateTransaction[] = failedFolders.map(f => f.split(':') as DelegateTransaction)
console.log(`failedFolders: `, failedFolders)
console.log(`failedTransactions: `, failedTransactions)

const redis = createRedisInstance()
let delegateWallets = await getDelegateAddresses(redis)

// IMPORTANT mechanism to make sure that no wallet was left behind
delegateWallets.forEach(delegateWallet => {

    // If a particular delegate address can't be found anywhere (neither in successful, skipped, or failed folders)
    // Then it's considered as a failed wallet
    if (!successfulTransactions.find(t => t[0] == delegateWallet)
        && !skippedFolders.includes(delegateWallet) 
        && !failedTransactions.find(t => t[0] == delegateWallet)) {
            
            failedTransactions.push([delegateWallet, '0x'])

    }

})
console.log(`failedTransactions: `, failedTransactions)

if (failedTransactions.length > 0) {
    logError(`${failedTransactions.length} wallets failed`)
}


let embedTitle = ''
let embedDescription = ''

const publicClient = createPublicEthClient()
const phase = await getCurrentPhase(publicClient)


if (phase == 0) {

    embedTitle = 'VOTES COMMITTED 🗳️'
    embedDescription = `UMA.rocks has committed votes for all wallets.`
    // Skipped wallets are wallets for which we couldn't commit because they already committed on their own. Failed wallets are wallets that didn't have enough ETH to cover the commit transaction gas fee.`

} else if (phase == 1) {

    embedTitle = 'VOTES REVEALED 👁️'
    embedDescription = `UMA.rocks has revealed votes for all wallets.`
    // Skipped wallets are wallets for which we couldn't reveal because they either already revealed on their own or they haven't committed any vote. Failed wallets are wallets that didn't have enough ETH to cover the reveal transaction gas fee.`

}


type Field = {
    name: string
    value: string
    inline: boolean
}

// from https://birdie0.github.io/discord-webhooks-guide/other/field_limits.html?highlight=1024#field-limits
const FIELD_NAME_MAX_LENGTH = 256
const FIELD_VALUE_MAX_LENGTH = 1024
const ellipsis = '\n⋯'
const maxValueLength = FIELD_VALUE_MAX_LENGTH - ellipsis.length


let embedFields: Field[] = [
    {
        name: `${successfulFolders.length} Successful`,
        value: ``,
        inline: false
    },
    {
        name: `${skippedFolders.length} Skipped`,
        value: skippedFolders.join('\n'),
        inline: false
    },
    {
        name: `${failedTransactions.length} Failed`,
        value: failedTransactions.map(t => delegateTransactionToDiscordMarkdown(t)).join('\n'),
        inline: false
    }
]
embedFields = formatFieldValues(embedFields)

await postOnDiscord(embedTitle, 4626987, embedDescription, embedFields)

function delegateTransactionToDiscordMarkdown(t: DelegateTransaction): string {
    return (t[1] != '0x' && t[1] != ZERO_ADDRESS) ? `[${t[0]}](https://etherscan.io/tx/${t[1]})` : t[0]
}

function formatFieldValues(fields: Field[]): Field[] {

    return fields.map(f => {
        
        let formattedValue = f.value

        if (formattedValue.length > FIELD_VALUE_MAX_LENGTH) {
            formattedValue = recursiveDelete(formattedValue)
        }

        return {
            name: f.name,
            value: formattedValue,
            inline: f.inline
        }
    })
}

function recursiveDelete(value: string): string {
    const lastIndexOf = value.lastIndexOf('\n')

    if (lastIndexOf <= maxValueLength) {
        return `${value.slice(0, lastIndexOf)}${ellipsis}`
    } else {
        return recursiveDelete(value.slice(0, lastIndexOf))
    }
}