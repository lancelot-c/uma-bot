import { createRedisInstance, logError } from "./common";
import { getCurrentUmaPrice } from "./update-uma-price";

run();

async function run() {

    const redis = createRedisInstance()
    const members: any[] = (await redis.get("MEMBERS") as any).all

    const totalStake = members.map((m: any) => m.umaStake).reduce((partialSum, a) => partialSum + a, 0);
    const currentTimestamp = Math.round(Date.now() / 1000)
    const currentUmaPrice = await getCurrentUmaPrice()
    
    const newTvl = {
        "t": currentTimestamp,
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
