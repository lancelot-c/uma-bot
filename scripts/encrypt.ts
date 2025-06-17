import 'dotenv/config'
import { encrypt } from "./../smart-contract-calls/encryption";

const messages = process.argv.slice(2);

run(messages)

async function run(messages: string[]): Promise<void> {
    
    for (const message of messages) {
        const encrypted = encrypt(message)
        console.log(encrypted)
    }

}