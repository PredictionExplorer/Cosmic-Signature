#

## Workspace

- This is a Hardhat 2 + Ethers.JS + Mocha project. Therefore, it not necessarily makes sense for you to access certain folders or files, such as `cache/`. Note that some paths are customized in `hardhat.config.js`.

## Git Repo

- In most cases, ask for my approval before adding an untracked file/folder to the Git repo or to `.gitignore`. I can instead ask you to trash the file/folder.
- When adding a file or a folder to `.gitignore`, use such a syntax that would match only the file system entry of that particular type (file or folder).

## Configuration

- Avoid redundant default configuration unless explicitly pinning the value improves reproducibility, security, compatibility, or documents an intentional invariant.

## Coding Guidelines

- Write strict code. That applies to everything, including JavaScript, shell scripts.
- Keep the code simple. Prefer simplicity over perfection. Some imperfections/issues are tolerable, provided their implications are understood and explained in comments. Describe an issue with a comment like this:

```solidity
// Issue. ...
// ...
```

- Also write an issue comment if there is a chance the issue will eventually need revisiting (become a todo). For example, if we implement a workaround to get a buggy or poorly designed third party library working, if the library developers fix their issue we would also likely need to refactor our code.

## Naming Conventions

- In the code, name things descriptively and verbosely. This also applies to file names. Do not force names to be short. Prefer to not shorten words, except for the following: `Prev`, `Param`, `Arg`, `Char`, `Min`, `Max`, `Temp`, `Num`. Also use commonly used abbreviations, such as `Json`, `Rpc`, `Url`, `Evm`, `Abi`, `Nft`.
- A function parameter or local variable name shall end with `_`. But some files do not comply with this instruction. Keep them as is and write new code in them in the same consistent style.

## Solidity

- Understand how conditional compilation in `.sol` files works. This is configured in `hardhat.config.js`. The `hardhat-preprocessor` NPM package is used. Conditionally compiled lines of code appear commented, but the `preProcessSolidityLine` function can uncomment the passed line on the fly during compile. For example:

```solidity
// #enable_asserts // #disable_smtchecker console.log(x, y);
// #enable_asserts assert(x > y);
```

can be compiled as:

```solidity
// #disable_smtchecker console.log(x, y);
assert(x > y);
```

or as:

```solidity
console.log(x, y);
assert(x > y);
```

## Scripts

- Each JavaScript or Bash script that is intended to be executed (not a library) shall contain the `main` function.

## Comments and ToDos

- Commented code is to be maintained. When making refactorings, try to refactor even commented code. But if the code would be incorrect if uncommented but would still require the refactoring, write a `ToDo-9` to refactor it in case it's uncommented. Remember that some commented code can be conditionally compiled, and therefore is to be treated as uncommented. Although different lines of code can be uncommented only under mutually exclusive conditions, so it's impossible that they all will be uncommented at the same time.
- Comments and docs should be brief. Write comments only about unobvious intricacies. For example, explain dependencies of logic in different parts of the codebase. Consider writing numbered comments/todos to link dependent parts of the codebase.
- That said, it can be helpful for me if you explain things in detail in verbose temporary to-be-deleted comments. Format them as follows:

```solidity
// TEMP: Details about what you did
// TEMP: and why you did id.
```

- Review [docs/numbered-comments.md](docs/numbered-comments.md). Feel free to write numbered comments/todos; just be sure to use IDs that do not exist in any file. Note that they can exist anywhere, including within strings or in text files.
- The above document describes todos to be done by humans. Use the following similar syntax for todos to be done by the AI.

```solidity
// [ToDo-AI-202512308-1]
// Do this and that.
// [/ToDo-AI-202512308-1]

// todo-ai-0 Do this and that ASAP.
```

```bash
# A todo like the above can be written in any file.
# Just use the comment syntax appropriate for the given file type.
```

- Don't do the human todos, but still pay attention to them. For example, if a human todo says to confirm a certain behavior, consider developing a test for it.
- When writing a comment (or a todo), insert it before relevant lines of code. Insert empty lines before the comment and after the last relevant line of code. When deleting a comment, delete the no longer needed empty lines, but be sure to not delete those needed for other comments.

## Uncategorized

- Prefer using only ASCII chars. For example, do not use `—`; use `--` instead. But if a file already contains some non-ASCII chars keep using them consistently.
- Some files do not comply with these instructions, and that's OK. Do not proactively improve existing code/text that's not broken. However, if you notice that a `.sol` file can be improved don't hesitate to recommend doing so. But avoid recommending anything listed in [docs/contract-improvement-ideas-not-to-implement-in-existing-code.md](docs/contract-improvement-ideas-not-to-implement-in-existing-code.md). That said, given that some contracts have already been deployed, it's too late to improve them, but at least issue-comments should be written in those about what it would be nice to improve.
