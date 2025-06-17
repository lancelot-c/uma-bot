import 'dotenv/config'
import { decrypt } from "../smart-contract-calls/encryption";

const messages = process.argv.slice(2);

run(messages)

async function run(messages: string[]): Promise<void> {
    
    for (const message of messages) {
        const encrypted = decrypt(message)
        console.log(encrypted)
    }

}