#

## Scope

- Use these instructions to guide requested work. If you believe the requested work's scope should be expanded, propose the additional work and wait for my approval before implementing it.

## Workspace

- This is a Hardhat 2.x + Ethers 6.x + Mocha project. Some paths are customized in `hardhat.config.js`.
- The `cache/` and `artifacts/` folders contain generated, configuration-dependent Hardhat outputs. They are usually not primary sources, but inspect them when relevant. Treat generated files as derived output rather than files to edit manually.

## Git Repo

- An explicit request to create or retain a repository file/folder counts as approval. Otherwise, ask before deciding that a newly created untracked entry should become tracked repository content or before adding an ignore rule for it.
- When adding a file or a folder to `.gitignore`, use such a syntax that would match only the file system entry of that particular type (file or folder).

## Configuration

- Avoid redundant default configuration unless explicitly pinning the value improves reproducibility, security, compatibility, or documents an intentional invariant.

## Coding Guidelines

- Keep the code simple and avoid unnecessary overengineering. The software shall work correctly and securely for all stated requirements and all realistically possible inputs and reachable states. In some cases, it's safe to assume that inputs cannot be incorrect or malicious. Do not add complexity solely to handle impossible states or unnecessary to support use cases. Collaborate with me on choosing the most appropriate tradeoffs. We can choose a simple solution that is possible to improve, but we can prefer it, to reduce the complexity. We can nickname the fact that we chose a less than ideal solution an "issue".
- An non-obvious issue shall be documented with an issue-comment like this:

```solidity
// Issue. Explain some of the following: assumptions; what missing logic is unnecessary; what are the implications; why it is currently acceptable; etc.
// The issue description can occupy multiple lines.
// ToDo-3 Possibly write a todo describing trigger conditions that would require revisiting the issue.
```

- Another example of an issue is if we implement a workaround to get a buggy or poorly designed third-party library working.
- If an issue has concrete foreseeable trigger conditions that would require revisiting it, add a nearby `ToDo-3` stating the trigger conditions.
- Some issues are obvious and/or frequent. They either need a comment without the `Issue` keyword or don't need a comment at all. For example, it's not necessarily needed to write near every unchecked math operator that we assume that it will not overflow. And when we do write that, we typically don't need the `Issue` keyword, except when the operands can be very big.

## Naming Conventions

- In the code, name things descriptively and verbosely. This also applies to file names. Do not force names to be short. Prefer not to shorten words, except for the following: `Prev`, `Param`, `Arg`, `Char`, `Min`, `Max`, `Temp`, `Num`, `hre`. Also use commonly used abbreviations, such as `Json`, `Rpc`, `Url`, `Evm`, `Abi`, `Nft`, `SmtChecker`.
- A function parameter or local variable name shall end with `_`. But some files do not comply with this instruction. Keep them as is and write new code in them in the same consistent style.

## Solidity

- Understand how conditional compilation works in `.sol` files. This is configured in `hardhat.config.js`. The `hardhat-preprocessor` NPM package is used. Conditionally compiled lines of code appear commented, but the `preProcessSolidityLine` function can uncomment the passed line on the fly during compile. For example:

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

- Before proposing improvements to existing Solidity code, review `docs/contract-improvement-ideas-not-to-propose-in-existing-code.md`. Do not propose the listed ideas in existing code.

## Scripts

- Each JavaScript or Bash script that is intended to be executed (not a library) shall define and invoke a `main` function.

## Comments and ToDos

- Maintain commented-out code when practical. When refactoring active code, update analogous commented-out code too. If commented-out code is already stale or cannot be updated without broader work, add a `ToDo-9` describing what must be done after it is uncommented.
- Some conditionally compiled alternatives are mutually exclusive. Keep each reachable compilation variant correct; mutually exclusive alternatives do not need to be valid simultaneously in one compilation.
- Comments and docs should be brief. Write comments only about non-obvious intricacies. For example, explain dependencies of logic in different parts of the codebase. Consider writing numbered comments/todos to link dependent parts of the codebase.
- That said, it can be helpful for me if you explain things in detail in verbose temporary to-be-deleted comments. Format them as follows:

```solidity
// TEMP: Details about what you did
// TEMP: and why you did it.
```

- Review `docs/numbered-comments.md`. Feel free to write numbered comments/todos.
- Before creating a new numbered comment or todo ID, search all repository files and confirm that the ID is unused. When linking another location to an existing numbered comment or todo, intentionally reuse its existing ID.
- `docs/numbered-comments.md` describes todos to be done by humans. Use the following similar syntax for todos to be done by the AI.

```solidity
// [ToDo-AI-202512308-1]
// Do this and that.
// [/ToDo-AI-202512308-1]

// ToDo-AI-0 Do this and that ASAP.
```

Todos like the above can be written in any file. Just use the comment syntax appropriate for the given file type. For example:

```bash
# ToDo-AI-0 Do this and that ASAP.
```

- Do AI todos only if requested to do so in the prompt. Delete every todo that you have completed.
- Don't do human todos. Only use them as context. For example, if the prompt says to develop tests and a human todo says to confirm a certain relevant behavior, consider proposing a test for that case.
- When deleting a numbered comment or numbered todo (AI or human), search for every occurrence of its ID and remove or update all affected references consistently.
- When writing a comment (or a todo), insert it before relevant lines of code. Insert empty lines before the comment and after the last relevant line of code. When deleting a comment, delete the no longer needed empty lines, but be sure to not delete those needed for other comments.

## Running Hardhat Tests

- To run Hardhat tests, from `package.json`, run the `hardhat-test-quick` script.
- When asked, run the `hardhat-test-full` script, which is more likely to detect bugs, but takes longer.

## Uncategorized

- Prefer using only ASCII chars. For example, do not use `—`; use `--` instead. But if the surrounding text intentionally uses non-ASCII chars, keep using them consistently.
- Some files do not comply with these instructions, and that's OK. Do not proactively improve existing code/text that's not broken.
