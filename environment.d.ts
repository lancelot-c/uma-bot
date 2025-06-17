declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PRIVATE_KEYS: string
            PRIVATE_KEYS_V2: string
            DISCORD_EMAIL: string
            DISCORD_PASSWORD: string
            DISCORD_CHANNEL_GENERAL_WEBHOOK_URL: string
            DISCORD_CHANNEL_HISTORY_WEBHOOK_URL: string
            ATTEMPT_DISCORD_LOGIN: string
            UPSTASH_API_KEY: string
            RPC_URL: string
        }
    }
}
  
export {}