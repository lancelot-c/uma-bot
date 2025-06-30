import { type Page, type Locator, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { readdir } from 'fs/promises'
import { z } from 'zod'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ALWAYS_APPROVE_GOVERNANCE_PROPOSALS, createPublicEthClient, decodeIdentifier, getDelegatePrivateKeys, getPendingRequests, logError, PriceIdentifier } from './../smart-contract-calls/common'


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// const NB_MILLISECONDS_IN_DAY = 86400000

// Seed phrase import in Metamask creates a number of useless wallets than need to be skipped
// in order to access the delegate wallets that are created afterwards
export const SEED_PHRASE_OFFSET = 13
// ⬆️ Previous values: 14, 13

export type Answer = {
    ancillaryData: `0x${string}`
    question: string
    answer: string
    skip?: boolean
    force?: boolean // if true, the answer will be committed even if another answer was already committed
}

export function getMostProbableAnswer(messagesPerUsers: { user: string, messages: string[] }[]): [string, number] {

    console.log(`> Detected messages in discussion`)
    console.log(messagesPerUsers)

    const NB_CHOICES = 4
    let answers = Array<number>(NB_CHOICES + 1).fill(0)

    // Loop users
    for (let u = 0; u < messagesPerUsers.length; u++) {

        const user = messagesPerUsers[u].user
        const messages = messagesPerUsers[u].messages
        let mostProbableAnswer = 0;

        console.log(`> Analyzing messages from ${user}`)

        // Loop messages for user
        for (let m = messages.length - 1; m >= 0; m--) {
            const message = messages[m]
            
            let maxCount = 0;
            let currentCount = 0;

            for (let p = 1; p <= NB_CHOICES; p++) {
                const regex = new RegExp(`p${p}`, 'gmi')
                currentCount = (message.match(regex) || []).length;
                console.log(`> Answer P${p} mentioned ${currentCount} times`)
    
                // If an answer appears more than another answer, we choose it as the most probable answer
                if (currentCount > maxCount) {

                    maxCount = currentCount;
                    mostProbableAnswer = p;

                }
                // If an answer appears as many times as another answer, we choose the one that is mentioned first as the most probable answer
                else if (currentCount == maxCount && currentCount > 0) {

                    const index1 = message.search(new RegExp(`p${mostProbableAnswer}`, 'gmi'))
                    const index2 = message.search(regex)
                    mostProbableAnswer = (index1 < index2) ? mostProbableAnswer : p

                }
            }

            // If an answer was found in the last message we are not interested in analyzing the previous messages
            if (mostProbableAnswer > 0) {
                break;
            }
        }

        answers[mostProbableAnswer] = answers[mostProbableAnswer] + 1
        console.log(`> Answer is P${mostProbableAnswer} according to ${user}`)

    }

    console.log(`> Number of users supporting each answer:`)
    console.log(answers)

    const mostProbableAnswer = indexOfMax(answers)
    const count = answers[mostProbableAnswer]
    console.log(`> The most probable answer is P${mostProbableAnswer} (supported by ${count} users)`)
    return [`P${mostProbableAnswer}`, count];
}

// See https://stackoverflow.com/a/11301464
function indexOfMax(arr: number[]) {
    if (arr.length === 0) {
        return -1;
    }

    var max = arr[0];
    var maxIndex = 0;

    for (var i = 1; i < arr.length; i++) {
        if (arr[i] > max) {
            maxIndex = i;
            max = arr[i];
        }
    }

    return maxIndex;
}

export async function postOnDiscord(embedTitle: string, embedColor: number, embedDescription?: string, embedFields?: any[], content?: string, customWebhookUrl?: string) {

    console.log('> Post message in UMA.rocks Discord')

    if (process.env.LOCAL === "true") {
        
        customWebhookUrl = process.env.DISCORD_CHANNEL_DEV_WEBHOOK_URL
    }

    const webhookUrl = customWebhookUrl ? customWebhookUrl : process.env.DISCORD_CHANNEL_HISTORY_WEBHOOK_URL

    if (!content) {
        content = ''
    }

    console.log('embedTitle: ', embedTitle)
    console.log('embedDescription: ', embedDescription)
    console.log('embedFields: ', embedFields)
    console.log('content: ', content)
    console.log('webhookUrl: ', webhookUrl)

    const maxFieldsPerEmbed = 25 // see https://birdie0.github.io/discord-webhooks-guide/structure/embed/fields.html
    let nbEmbeds = 0
    
    if (embedFields && embedFields.length > 0) {
        nbEmbeds = Math.ceil(embedFields.length / maxFieldsPerEmbed)
    }

    let embeds: any[] = [];

    for (let i = 0; i < nbEmbeds; i++) {

        const newEmbed = {
            "title": i == 0 ? embedTitle : '',
            "description": i == 0 ? embedDescription : '',
            "color": embedColor, // decimal index of a color, see https://www.spycolor.com
            "fields": (embedFields ? embedFields : []).slice(i * maxFieldsPerEmbed, (i * maxFieldsPerEmbed) + maxFieldsPerEmbed) // see https://stackoverflow.com/a/8495740
        }
    
        embeds.push(newEmbed)
    }

    const params = {
        "content": content,
        "embeds": embeds
    }

    await fetch(webhookUrl, {
        method: "POST",
        headers: {
            'Content-type': 'application/json'
        },
        body: JSON.stringify(params)
    }).then(res => {
        console.log(`Webhook response: { status: ${res.status}, statusText: ${res.statusText}, ok: ${res.ok} }`);
    }).catch((err: any) => {
        logError(err)
    })

}


// Custom implementation of `locator.allTextContents()` that is not utilizing `.map` which is not accessible under MetaMask's scuttling mode.
export async function allTextContents(locators: Locator[]) {
    const names = await Promise.all(locators.map((locator) => locator.textContent()))

    // We're making sure that the return type is `string[]` same as `locator.allTextContents()`.
    return names.map((name) => z.string().parse(name))
}

export function addSkippedWallet(delegateAddress: `0x${string}`) {
    createEmptyFolder(`./../test-data/skipped/${delegateAddress}`)
}

export function addFailedWallet(delegateAddress: `0x${string}`, transactionHash?: `0x${string}` | undefined) {
    if (!transactionHash) {
        transactionHash = '0x'
    }
    createEmptyFolder(`./../test-data/failed/${delegateAddress}:${transactionHash}`)
}

export function addSuccessfulWallet(delegateAddress: `0x${string}`, transactionHash?: `0x${string}` | undefined) {
    if (!transactionHash) {
        transactionHash = '0x'
    }
    createEmptyFolder(`./../test-data/successful/${delegateAddress}:${transactionHash}`)
}

export function createEmptyFolder(folderRelativePath: string) {

    const folderAbsolutePath = path.join(__dirname, folderRelativePath)
    console.log(`> Create folder ${folderAbsolutePath}`)

    if (!fs.existsSync(folderAbsolutePath)) {
        fs.mkdirSync(folderAbsolutePath);
    }
}

// See https://stackoverflow.com/a/24594123
export const getDirectories = async (source: string) => (await readdir(source, { withFileTypes: true })).filter(dirent => dirent.isDirectory()).map(dirent => dirent.name)



export async function saveAnswers(answers: Answer[], votingRound?: number): Promise<boolean> {

    let customResolve: (value: boolean) => void;
    const customPromise = new Promise<boolean>((resolve, reject) => {
        customResolve = resolve
    });
    
    const fileName = votingRound ? `voting-round-${votingRound}.json` : 'answers.json'

    fs.writeFile(`./uma-bot/test-data/${fileName}`, JSON.stringify(answers, undefined, 4), (error: any) => {
        if (error) {
            customResolve(false)
            logError(error)
            throw error;
        } else {
            customResolve(true)
        }
    });

    return customPromise;
}



export async function scrapAnswers(page: Page): Promise<[boolean, boolean, Answer[]]> {

    let answers: Array<Answer> = []
    let commitPhaseOpen = false
    let revealPhaseOpen = false

    // should open UMA voting app
    const umaAppUrl = `https://vote.uma.xyz/`
    console.log(`> Load page ${umaAppUrl}`)
    await page.goto(umaAppUrl);

    const commitPhaseLocator = page.getByRole('button', { name: 'Choose answer' }).first()
    const revealPhaseLocator = page.getByText('Time remaining to reveal votes:')
    // When there is no phase, the first table title is either "Upcoming votes:" or "Recent past votes:"
    const noPhaseLocator = page.locator('h1').nth(5).getByText('Upcoming votes:').or(page.locator('h1').nth(5).getByText('Recent past votes:'))
    const moreDetailsButtons = page.getByRole('table').first().getByLabel('More details')
    const panelHeader = page.locator('#panel-title')
    const detailsTab = page.getByRole('tab', { name: 'Details' })
    // const joinDiscordDetailsTab = page.getByRole('link', { name: 'Join the discussion on Discord' })
    const viewRawAncillaryData = page.getByText('(view raw)')
    const viewDecodedAncillaryData = page.getByText('(view decoded)')
    const decodedAncillaryDataHeader = page.getByRole('heading', { name: 'Decoded ancillary data' })
    const decodedAncillaryDataDiv = decodedAncillaryDataHeader.locator("..") // `locator("..")` means "parent element"
    const closePanelButton = page.getByRole('dialog').getByRole('button')
    const paginationDropdown = page.getByRole('button', { name: 'results' })
    const paginationDropdownOption50 = page.getByRole('menuitem', { name: '50 results' })

    console.log(`> Detecting phase of the voting round`)
    try {

        await commitPhaseLocator.or(revealPhaseLocator).or(noPhaseLocator).waitFor({ timeout: 20000 })

    } catch (error: any) {

        logError(error)

    }

    if (await commitPhaseLocator.isVisible()) {

        commitPhaseOpen = true
        console.log(`> Commit phase open`)

    } else if (await revealPhaseLocator.isVisible()) {

        revealPhaseOpen = true
        console.log(`> Reveal phase open`)

    } else if (await noPhaseLocator.isVisible()) {
        // Nothing to do, commitPhaseOpen and revealPhaseOpen are already set to false
    }

    if (commitPhaseOpen) {
        console.log('> Time to vote')

        // Display all disputes on the page
        if (await paginationDropdown.isVisible()) {
            await paginationDropdown.click();
            await paginationDropdownOption50.click();
        }

        // Count disputes
        const moreDetails = await moreDetailsButtons.all()
        const nbDisputes = moreDetails.length

        console.log(`> ${nbDisputes} disputes detected`)

        // Get disputes metadata - needed to infer price identifier from ancillary data
        console.log(`> Get disputes metadata`)
        const publicClient = createPublicEthClient()
        const requests = await getPendingRequests(publicClient)

        if (requests.length != nbDisputes) {
            logError(`${nbDisputes} disputes detected on the UMA webapp but ${requests.length} requests detected on the smart contract`)
        }


        console.log('> Get answers')

        for (let d = 0; d < nbDisputes; d++) {

            console.log(`\n> *** Dispute ${d} ***\n`)
            let answer: Answer = {
                ancillaryData: '0x',
                question: '',
                answer: ''
            }

            console.log(`> Open right panel`)
            await moreDetails[d].click();

            console.log(`> Get question string`)
            const question = (await panelHeader.innerHTML()).split('<div ')[0]
            answer.question = question;


            // Get dispute ancillary data
            console.log(`> Click details tab`)
            await detailsTab.click();

            console.log(`> Click on button to view raw ancillary data`)
            try {
                await viewRawAncillaryData.or(viewDecodedAncillaryData).waitFor({ timeout: 20000 })
            } catch (error: any) {
                logError(error)
            }

            // We only need to click once for the first dispute as the right panel is preserved for the next disputes
            if (await viewRawAncillaryData.isVisible()) {
                await viewRawAncillaryData.click()
            }
            
            await expect(decodedAncillaryDataDiv).toBeVisible({ timeout: 20000 });
            const ancillaryData: `0x${string}` = `0x${((await decodedAncillaryDataDiv.textContent({ timeout: 20000 })) || "_0x_").split('0x')[1]}`
            /* Example of decodedAncillaryDataDiv.textContent() :
            ' Decoded ancillary data (view decoded)0x616e63696c6c61727944617461486173683a366266303262616531663562363261376332643264336265656630366635636561653039656632623338633531363166613931336665666435363134653131382c6368696c64426c6f636b4e756d6265723a37303333353039372c6368696c644f7261636c653a616336303335336135343837336334343631303132313638323961366139386364626263336633642c6368696c645265717565737465723a656533616665333437643563373433313730343165323631386334393533346461663838376332342c6368696c64436861696e49643a313337'
            */

            if (ancillaryData == '0x_') {
                logError(`Couldn't retrieve ancillary data`);
            }

            answer.ancillaryData = ancillaryData


            // Get dispute price identifier
            let priceIdentifier: PriceIdentifier
            const requestFound = requests.find(r => r.ancillaryData == answer.ancillaryData)

            if (requestFound) {
                const decodedRequestIdentifier = decodeIdentifier(requestFound.identifier)
                if (decodedRequestIdentifier === undefined) {
                    logError(`Identifier is undefined for dispute ${d+1}`)
                    continue
                } else {
                    priceIdentifier = decodedRequestIdentifier
                }
            } else {
                logError('Cannot find a request matching this dispute ancillary data')
                continue
            }


            // Get dispute answer
            answer = await computeDisputeAnswer(answer, priceIdentifier, page)
            
            if (answer.skip) {
                logError(`Skip = true for dispute "${answer.question}" (ancillaryData:${answer.ancillaryData})`)
            }

            
            answers.push(answer)

            await closePanelButton.click()
        }

        // When 2 disputes with the same question get different answers, pick the answer of the first dispute
        // for (let i = 0; i < answers.length; i++) {
        //     const question = answers[i].question
        //     const firstChoice = answers[i].choice
        //     const foundIndex = answers.findIndex((a, index) => index > i && a.question === question && a.choice != firstChoice);
            
        //     if (foundIndex > -1) {
        //         const secondChoice = answers[foundIndex].choice
        //         logError(`Different answers for the same question: "${question}". First answer is P${firstChoice}, second answer is P${secondChoice}. Picking the first answer.`)
        //         answers[foundIndex].choice = firstChoice
        //     }
        // }

        console.log(`\n> Answers: ${answers.map((a, i) => `\n#${i}\nQuestion: ${a.question}\nAnswer: ${a.answer}\nSkip: ${a.skip}\Force: ${a.force}\n\n`)}`)

    }

    return [commitPhaseOpen, revealPhaseOpen, answers]
}


export async function executeWithTimeout(fn: () => any, { timeout }: { timeout: number}): Promise<boolean> {

    return new Promise<boolean>(async (resolve, reject) => {

        setTimeout(() => {
            
            reject()

        }, timeout)

        await fn()
        resolve(true)
    });

}



async function computeDisputeAnswer(answer: Answer, priceIdentifier: PriceIdentifier, page: Page): Promise<Answer> {

    if (priceIdentifier == "Admin" && ALWAYS_APPROVE_GOVERNANCE_PROPOSALS) {
        answer.answer = "Yes"
        return answer
    }
    
    answer = await computeDisputeAnswerFromDiscordDiscussion(answer, page)

    return answer
}

async function computeDisputeAnswerFromDiscordDiscussion(answer: Answer, page: Page): Promise<Answer> {

    const discussionTab = page.getByRole('tab', { name: 'Discussion' })
    const discussionLoadedLocator = page.getByLabel('Discussion').locator('div').filter({ hasText: '202' }).first() // hasText: '202' is a nice hack to detect when messages are loaded because messages contains dates like "2025-04-18, 3:36 PM"
    const discussionPanel = page.getByLabel('Discussion').locator('div').filter({ hasText: 'These discussions are from the UMA Protocol Discord' }).first()
    const joinDiscordDiscussion = page.getByLabel('Join discussion on Discord').last()

    console.log(`> Click discussion tab`)
    await discussionTab.click();

    console.log(`> Wait for discussions to load completely`)

    try {
        await discussionLoadedLocator.waitFor({ timeout: 10000 })
    } catch {
        logError('Timeout on discussionLoadedLocator')
    }
    

    let messagesPerUsers = new Array<{ user: string, messages: string[] }>()

    // Otherwise get the answers from the whole discussion string
    try {

        await discussionPanel.waitFor({ timeout: 10000 })
        await joinDiscordDiscussion.scrollIntoViewIfNeeded({ timeout: 10000 })

        const allMessages = await Promise.all((await discussionPanel.locator('> div').all()).slice(3).slice(0, -1).map(async (m) => await m.textContent() as string))

        for (let m = 0; m < allMessages.length; m++) {

            const string = allMessages[m]
            const split = string.split(' ')
            const user = split[0]
            const message = split.slice(1).join(' ')

            const foundIndex = messagesPerUsers.findIndex(a => a.user === user)
            if (foundIndex > -1) {
                messagesPerUsers[foundIndex].messages.push(message)
            } else {
                messagesPerUsers.push({ user, messages: [message] })
            }

        }

        // Let UMA.rocks or any other trusted user have the final word 👑
        const trustedUsers = (process.env.TRUSTED_USERS as string).split(',')

        for (let i = 0; i < trustedUsers.length; i++) {
            const trustedUser = trustedUsers[i]
            const foundIndex = messagesPerUsers.findIndex(a => a.user === trustedUser);
            if (foundIndex > -1) {
                messagesPerUsers = [{ user: trustedUser, messages: messagesPerUsers[foundIndex].messages }];
                break;
            }
        }

    } catch (err) {

        logError('Timeout for locator discussionPanel');

    }

    const [mostProbableAnswer, nbOccurences] = getMostProbableAnswer(messagesPerUsers)
    answer.answer = mostProbableAnswer

    if (answer.answer === 'P0') {
        logError(`Found answer P0 for "${answer.question}"`)
    }

    // If nbOccurences = 0, there must have been a problem reading the discussion string
    // for example if the Discord conversation couldn't be loaded
    // and therefore it's better not to vote for anything than voting wrong
    if (nbOccurences == 0) {
        answer.skip = true
    }

    return answer
}