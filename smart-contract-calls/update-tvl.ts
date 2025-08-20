import { createRedisInstance, logError } from "./common";

run();

async function run() {

    const redis = createRedisInstance()
    const members: any[] = (await redis.get("MEMBERS") as any).all

    const totalStake = Math.round(members.map((m: any) => m.umaStake).reduce((partialSum, a) => partialSum + a, 0));
    // const currentTimestamp = Math.round(Date.now() / 1000)
    const currentDate = (new Date()).toISOString().split('T')[0]
    const currentUmaPrice = await redis.get("UMA_PRICE") as number;
    
    let newTvl = {
        "t": currentDate,
        "s": totalStake,
        "p": currentUmaPrice
    }

    let tvlHistory: any[] = (await redis.get("TVL_HISTORY") as any).all
    tvlHistory.push(newTvl)

    const newTvlHistory = {
        "all": tvlHistory
    }

    try {
            
        await redis.set("TVL_HISTORY", newTvlHistory)

    } catch (error) {
        
        await logError(error.message, `Could not update the TVL history`)

    }

}
