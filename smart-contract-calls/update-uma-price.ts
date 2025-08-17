import { createRedisInstance, logError } from "./common";


try {

    const umaPrice = await getCurrentUmaPrice()

    console.log(`Fetched UMA price: $${umaPrice}`);

    if (umaPrice && umaPrice > 0) {
        
        await updateUmaPrice(umaPrice)

    } else {
        
        logError(`Invalid UMA price`);
    
    }
    

} catch (error) {
    
    logError(error.message, `Could not fetch the UMA price`)

}

export async function getCurrentUmaPrice(): Promise<number | undefined> {

    const apiUrl = `https://api.coingecko.com/api/v3/simple/price?x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}&vs_currencies=usd&ids=uma&precision=2`

    const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
            'Content-type': 'application/json'
        }
    });

    if (!response.ok) {
        logError(response.statusText, `Could not fetch the UMA price`);
        return undefined
    }

    const json = await response.json();
    const umaPrice: number | undefined = json?.uma?.usd

    return umaPrice
}


export async function updateUmaPrice(umaPrice: number) {

    const redis = createRedisInstance()

    try {
        
        await redis.set("UMA_PRICE", umaPrice)

    } catch (error) {
        
        await logError(error.message, `Could not update the UMA price`)
    
    }

}