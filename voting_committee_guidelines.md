The UMA.rocks voting committee members, added as reviewers to this PR, need to choose the answers for the current voting round.

# Guidelines for the voting committee

**TL;DR:** Make the relevant changes to this PR, then wait for the majority of reviewers to approve it, then merge it.
Use comments to solve conflicts and find consensus with your fellow reviewers. **Merge needs to occur imperatively before 11:00AM UTC.**

## Select answers
Go to the `Files changed` tab and click on `...` on the top-right of the json file then click on `Edit file`:
<img width="514" height="550" alt="image" src="https://github.com/user-attachments/assets/b8b5d7b9-e6bf-4c2b-8e0a-e039b9ac227c" />

The file editor opens. By default all disputes have a `P0` answer, replace it with the answer you think is the correct one:
```
{
    "ancillaryData": "0x616e63696c6c61727944617461486173683a363466383561343338306639613061353934316164303733376264616538633037643964333036353039653763373264303966313135363338623438613138302c6368696c64426c6f636b4e756d6265723a37333837353732372c6368696c644f7261636c653a616336303335336135343837336334343631303132313638323961366139386364626263336633642c6368696c645265717565737465723a656533616665333437643563373433313730343165323631386334393533346461663838376332342c6368696c64436861696e49643a313337",
    "question": "Will Donald Trump sign an executive order on July 11?",
    "answer": "<Insert your answer here>"
}
```
You only need to change the `answer` parameter for all elements of the array. Please do not modify the `ancillaryData` and `question` parameters.

Then click `Commit changes...` at the top. A popup appears, click `Commit changes` again to confirm.

<img width="574" height="589" alt="image" src="https://github.com/user-attachments/assets/d20353d0-f4d9-4c5b-a504-a7dc008b5f59" />


## Solve disagreements with comments
If you disagree with an answer, you can add a comment on the corresponding line by clicking the `+` icon at the beginning of the line, then write your comment and click `Add a single comment`.

Use this to start a conversation with your fellow reviewers and reach a consensus for this dispute.

<img width="710" height="423" alt="image" src="https://github.com/user-attachments/assets/e953c3d0-e02a-427d-ae92-2d726a60fc65" />


## Approve the answers
When you agree with all the answers, go in the `Files changed` tab, click `Review changes`, write an optional comment, select the `Approve` option, and click `Submit review`.
<img width="1870" height="1294" alt="image" src="https://github.com/user-attachments/assets/7c5952a9-1f31-4dbf-9ac8-988bc6e32e45" />

## Merge the pull request
When the majority of reviewers have approved the pull request, it is ready to be merged.
Don't waste time and merge the pull request as soon as the `Merge pull request` button is enabled at the bottom of the `Conversation` tab.

<img width="752" height="152" alt="image" src="https://github.com/user-attachments/assets/22f0eedc-3b87-4ba4-9f13-c1a3d1304980" />

**Merge needs to occur imperatively before 11:00AM UTC**, otherwise the voting bot won't have any answer to commit for the pool, which means we will need to manually force push some answers & relaunch the bot manually. Ideally, this scenario should never happen. 🙂
