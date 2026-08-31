#

## Scope

- Use these instructions to guide requested work. If you believe the requested work's scope should be expanded, propose the additional work and wait for my approval before implementing it.
- Some files do not comply with these instructions, and that's OK. Do not propose bringing existing non-broken code/text into compliance unless requested to do so in the prompt.

## Workspace

- This is a Hardhat 2.x + Ethers 6.x + Mocha project. Some paths are customized in `hardhat.config.js`.
- The `cache/` and `artifacts/` folders contain generated, configuration-dependent Hardhat outputs. They are usually not primary sources, but inspect them when relevant. Treat generated files as derived output rather than files to edit manually.

## Git Repo

- An explicit request to create or retain a repository file/folder counts as approval. Otherwise, ask before deciding that a newly created untracked entry should become tracked repository content or before adding an ignore rule for it.
- When adding a file or a folder to `.gitignore`, use such a syntax that would match only the file system entry of that particular type (file or folder).

## Configuration

- Avoid redundant default configuration unless explicitly pinning the value improves reproducibility, security, compatibility, or documents an intentional invariant.

## Coding Guidelines

- Keep the code simple and avoid unnecessary overengineering. The software shall work correctly and securely for all stated requirements and all realistically possible inputs and reachable states. Do not add complexity solely to handle impossible states or use cases that do not need to be supported.
- Do not autonomously introduce a material tradeoff involving correctness, security, compatibility, or trust assumptions. Identify the available options and their implications, and let me choose among them.
- Do not assume that an input is valid or non-malicious unless that assumption follows from an enforced invariant or I approve it.
- With my approval, a simpler solution that can be improved later may be preferred over a more complex ideal solution, provided it satisfies the approved correctness and security requirements.
- An "issue" is a concrete, understood, and currently accepted concern or undesirable aspect of an implementation or design. Examples include non-ideal behavior, inconsistencies, inefficiencies, code smells, maintainability problems, fragility, coupling, omissions, assumptions, workarounds, latent risks, reliance on behavior that future changes could invalidate, and other imperfections.
- Unlike a todo, an issue records something we do not currently plan to change. It is accepted because the current solution is adequate, improving it is not presently worth the added complexity, cost, or risk, or a change elsewhere -- including in an external dependency -- must happen first.
- A non-obvious issue shall be documented with an issue-comment like this:

```solidity
// Issue. (Briefly explain what is undesirable and its implications.
// As relevant, mention assumptions, dependencies, workarounds, omissions, or why the issue
// is currently accepted rather than made a todo.)
```

- If an issue has concrete, foreseeable trigger conditions that would require revisiting it, detail those conditions in a `ToDo-3` after the issue-comment.
- Obvious or frequent issues do not require an issue-comment. Add an ordinary comment only when it provides useful non-obvious context. For example, it is unnecessary to state near every unchecked arithmetic operation that it is assumed not to overflow. Such a comment or issue-comment can be appropriate when the absence of overflow is non-obvious because the operands may be large.

## Naming Conventions

- In the code, name things descriptively and verbosely. This also applies to file names. Do not force names to be short. Prefer not to shorten words, except for the following: `Prev`, `Param`, `Arg`, `Char`, `Min`, `Max`, `Temp`, `Id`, `Num`, `hre`. Also use commonly used abbreviations, such as `Json`, `Rpc`, `Url`, `Evm`, `Abi`, `Nft`, `SmtChecker`.
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

- Before proposing improvements to existing Solidity code, review `docs/contract-improvement-ideas-not-to-propose-in-existing-code.md`. Do not propose the listed Solidity improvement ideas for existing code unless explicitly requested. You may propose them for new code, but do not implement them without approval in the prompt or an approved plan. This restriction does not prohibit reporting concrete defects or risks discovered during a requested code review.

## Scripts

- Each JavaScript or Bash script that is intended to be executed (not a library) shall define and invoke a `main` function.

## Comments and ToDos

- Maintain commented-out code when practical. When refactoring active code, update analogous commented-out code too. If commented-out code is already stale or cannot be updated without broader work, add a `ToDo-9` describing what must be done after it is uncommented.
- Some conditionally compiled alternatives are mutually exclusive. Keep each reachable compilation variant correct; mutually exclusive alternatives do not need to be valid simultaneously in one compilation.
- Comments and docs should be brief. Write comments only about non-obvious intricacies. For example, explain dependencies of logic in different parts of the codebase.
- That said, it can be helpful for me if you explain things in detail in verbose temporary to-be-deleted comments. Format them as follows:

```solidity
// DEL: (Provide details about what you did
// DEL: and why you did it.)
```

- Review `docs/numbered-comments.md`. Prefer writing numbered items when they offer an advantage over their non-numbered counterparts. Consider using numbered items to link dependent or similar parts of the codebase. Similar code is not necessarily dependent, but when one occurrence requires refactoring, other occurrences may require the same change. A numbered comment identifying repeated logic or data structures can help locate all affected places.
- Perform AI or human todos only if requested to do so in the prompt. Delete every todo that you have completed.
- If you are not to perform a human todo, use it as context. For example, if the prompt says to develop tests and a human todo says to confirm a certain relevant behavior, consider proposing a test for that case.
- When an explanatory comment or todo occupies one or more separate lines and is associated with code, place it before the relevant lines. Insert an empty line before the comment and after the last relevant line of code when the surrounding structure permits it. When deleting a comment, delete any empty lines that are no longer needed, but be sure not to delete empty lines needed for other comments.

## Running Hardhat Tests

- Unless the prompt says not to run Hardhat tests, after completing an approved batch of changes to executable or conditionally compiled Solidity code or to Hardhat test logic, run `npm run hardhat-test-quick` from the workspace root.
- Run `npm run hardhat-test-medium` or `npm run hardhat-test-full` instead only when the prompt explicitly requests to do so.

## Uncategorized

- Minimize model usage by skipping actions that do not affect the end result.
- Prefer using only ASCII chars. For example, instead of `—`, use `--`. But if the surrounding text intentionally uses non-ASCII chars, keep using them consistently.
