import { PrivateKeyAccount, PublicClient, WalletClient } from 'viem'
import { umaContractAbi } from '../test/umaAbi'
import { umaContractAddress, createPublicEthClient, createRedisInstance, logError, getDelegateAccounts, createWalletEthClient, ZERO_ADDRESS } from './common'
import { Redis } from '@upstash/redis'


const redis = createRedisInstance()
const delegateAccounts = await getDelegateAccounts(redis)

if (delegateAccounts.length == 0) {
    throw Error('No delegate account detected. Exit job.')
}

const publicClient = createPublicEthClient()
const walletClient = createWalletEthClient()

type DelegateMetadata = {
    delegateAddress: `0x${string}`
    stakerAddress: `0x${string}` | undefined
    umaStake: number | undefined
    existingDelegate: `0x${string}` | undefined
}

let delegateInfos: DelegateMetadata[] = []

for (let i = 0; i < delegateAccounts.length; i++) {

    const delegateAddress = delegateAccounts[i].address
    const infos = await getDelegateInfos(delegateAddress, publicClient)
    delegateInfos.push(infos)

    await removeDelegatorIfInvalid(delegateAccounts[i], infos, redis, publicClient, walletClient)
    
}

await updateStakes(delegateInfos)


// If delegator is invalid, remove it and return true. Return false otherwise.
export async function removeDelegatorIfInvalid(delegateAccount: PrivateKeyAccount, delegateInfos: DelegateMetadata, redis: Redis, publicClient: PublicClient, walletClient: WalletClient): Promise<boolean> {

    const delegateAddress = delegateAccount.address
    const shouldRemove = shouldRemoveDelegator(delegateInfos)

    if (shouldRemove) {

        // Remove from our backend
        await deleteMemberFromBackend(delegateAddress, redis)

        /* DEPRECATED: no need to remove the delegator anymore, we are enabling him to rejoin anytime by increasing its stake again AND/OR making another delegation request to us */
        // Remove delegator from UMA smart contract
        // await removeDelegator(delegateAccount, publicClient, walletClient)

        // Post message on Discord
        // const errorTitle = `Someone just left the pool 😢`
        // const errorMessage = `Delegator ${delegateInfos.stakerAddress} with delegate ${delegateInfos.delegateAddress}. Remove it manually from the UMA webapp.`
        // await logError(errorMessage, errorTitle)

        return true
    }

    return false
}


// Returns removed delegator address
export async function deleteMemberFromBackend(delegateAddress: `0x${string}`, redis: Redis): Promise<`0x${string}`> {

    let delegatorAddress: `0x${string}` = ZERO_ADDRESS

    let delegateEncryptedPrivateKey: string = ''
    let indexToRemove: number = -1
    let kvKey: string = ''
    let members: any[] = []


    // Remove from MEMBERS
    try {

        kvKey = 'MEMBERS'
        members = (await redis.get(kvKey) as any).all as any[]
        indexToRemove = members.findIndex(m => m.delegate.toLowerCase() == delegateAddress.toLowerCase())

        if (indexToRemove == -1) {
            logError(`Cannot find ${delegateAddress} in Redis MEMBERS key`)
            return delegatorAddress
        }

        const memberToRemove = members[indexToRemove]
        delegateEncryptedPrivateKey = memberToRemove.pk as string
        delegatorAddress = memberToRemove.delegator

        members.splice(indexToRemove, 1)
        const newMembers = {
            all: members
        }

        await redis.set(kvKey, newMembers);

    } catch (err) {
        logError(`Cannot remove ${delegateAddress} from Redis MEMBERS key`)
        return delegatorAddress
    }


    // Add to PENDING
    kvKey = 'PENDING'
    const oldPending: any[] = (await redis.get(kvKey) as any).all as any[]
    const newDelegate = {
        delegate: delegateAddress,
        pk: delegateEncryptedPrivateKey,
        delegator: delegatorAddress
    };
    oldPending.push(newDelegate)

    const newPending = {
        all: oldPending
    }

    try {
        await redis.set("PENDING", newPending)
    } catch (err) {
        logError(`Cannot add delegate ${delegateAddress} to Redis PENDING key`)
        return delegatorAddress
    }


    return delegatorAddress
    
}


// Checks if the delegator still stakes, has the minimum UMA stake, & still has UMA.rocks as a delegate
export function shouldRemoveDelegator(infos: DelegateMetadata): boolean {

    /* ⚠️ IMPORTANT: Protection to avoid removing delegators if the query to the smart contract failed.
    Indeed, it could simply be a Viem bug or RPC client downtime.
    Therefore, it's not a proof that the delegator is invalid and we shouldn't remove it. */
    if (!infos || infos.stakerAddress === undefined || infos.umaStake === undefined || infos.existingDelegate === undefined || process.env.MINIMUM_UMA_STAKE === undefined || Number(process.env.MINIMUM_UMA_STAKE) == 0 || Number(process.env.MINIMUM_UMA_STAKE) != 1000) {
        return false
    }

    const isNotDelegatedToUmaRocks = infos.existingDelegate.toLowerCase() != infos.delegateAddress.toLowerCase()
    const hasNotEnoughStake = infos.umaStake < Number(process.env.MINIMUM_UMA_STAKE)

    return isNotDelegatedToUmaRocks || hasNotEnoughStake

}

export async function getDelegateInfos(delegateAddress: `0x${string}`, publicClient: PublicClient): Promise<DelegateMetadata> {

    let stakerAddress: `0x${string}` | undefined = undefined
    let umaStake: number | undefined = undefined
    let existingDelegate: `0x${string}` | undefined = undefined


    // Get staker address from delegate address
    let response;
    try {

        response = await publicClient.readContract({
            address: umaContractAddress,
            abi: umaContractAbi,
            functionName: 'delegateToStaker',
            args: [delegateAddress]
        });

    } catch (err: any) {
        logError(err)
        return {
            delegateAddress,
            stakerAddress,
            umaStake,
            existingDelegate
        }
    }

    stakerAddress = response as `0x${string}`;
    // const shortenedStakerAddress = `${stakerAddress.substring(0, 6)}…${stakerAddress.slice(-4)}`
    console.log(`stakerAddress = ${stakerAddress}`)

    // Get UMA stake from staker address
    try {

        response = await publicClient.readContract({
            address: umaContractAddress,
            abi: umaContractAbi,
            functionName: 'voterStakes',
            args: [stakerAddress]
        });

    } catch (err: any) {
        logError(err)
        return {
            delegateAddress,
            stakerAddress: stakerAddress,
            umaStake: 0,
            existingDelegate
        }
    }


    umaStake = Number((Number(BigInt((response as any)[0]) / BigInt(10 ** 15)) / 1000).toFixed(2));
    console.log(`umaStake = ${umaStake}`)

    existingDelegate = (response as any)[7] as `0x${string}`

    return {
        delegateAddress,
        stakerAddress,
        umaStake,
        existingDelegate
    }

}

export async function updateStakes(delegateInfos: DelegateMetadata[]): Promise<any> {

    const oldMembers = (await redis.get("MEMBERS") as any).all as any[];

    oldMembers.map((member) => {

        const foundStake = delegateInfos.find(i => i && i.stakerAddress && i.stakerAddress.toLowerCase() == member.delegator.toLowerCase())

        if (foundStake) {
            member.umaStake = foundStake.umaStake
        }

        return member
    })

    const updatedMembers = {
        all: oldMembers
    }


    try {

        await redis.set("MEMBERS", updatedMembers);
        console.log(`✅ Successfully updated ${delegateInfos.length} pool member stakes`)

    } catch (err) {
        console.error(err)
    }

}