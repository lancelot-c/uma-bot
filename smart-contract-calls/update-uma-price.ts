import { createRedisInstance, logError } from "./common";

const apiUrl = `https://api.coingecko.com/api/v3/simple/price?x_cg_demo_api_key=${process.env.COINGECKO_API_KEY}&vs_currencies=usd&ids=uma&precision=2`

try {

    const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
            'Content-type': 'application/json'
        }
    });

    if (!response.ok) {
        logError(response.statusText, `Could not fetch the UMA price`);
    }

    const json = await response.json();
    const umaPrice = json?.uma?.usd
    console.log(`Fetched UMA price: $${umaPrice}`);

    if (umaPrice && umaPrice > 0) {
        
        await updateUmaPrice(umaPrice)

    } else {
        
        logError(`Invalid UMA price`);
    
    }
    

} catch (error) {
    
    logError(error.message, `Could not fetch the UMA price`)

}


export async function updateUmaPrice(umaPrice: number) {

    const redis = createRedisInstance()

    try {
        
        await redis.set("UMA_PRICE", umaPrice)

    } catch (error) {
        
        await logError(error.message, `Could not update the UMA price`)
    
    }

}