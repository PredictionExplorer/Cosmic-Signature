#

## Workspace

- This is a Hardhat 2 + Ethers.JS + Mocha project. Therefore, it probably makes no sense for you to access certain folders or files, such as `cache/`. Note that some paths are customized in `hardhat.config.js`.

## Git Repo

- When adding a file or a folder to `.gitignore`, use such a syntax that would match only the file system entry of that particular type (file or folder).
- In most cases, ask for my approval before adding a file/folder to the Git repo or to `.gitignore`. Some files/folders should be considered garbage and therefore should be deleted instead of adding them to `.gitignore`.

## Configuration

- In config files, prefer not to explicitly configure parameters that anyway have the desired values by default.

## Solidity

- Understand how conditional compilation in `.sol` files works. This is configured in `hardhat.config.js`. The `hardhat-preprocessor` NPM package is used. Conditionally compiled code is commented, but it can be uncommented on the fly during compile.

## Uncategorized

- Keep the code simple and docs and comments brief. Prefer simplicity over perfection. Some imperfections/issues are tolerable, provided their implications are understood and explained in comments. Describe an issue with a comment like this:

```solidity
// Issue. ...
// ...
```

- Write strict code. That applies to everything, including JavaScript, shell scripts. Configure the project to enforce the strictness.
- In the code, name things descriptively and verbosely. This also applies to file names. Do not force names to be short. Do not shorten words, except for the following: `Prev`, `Param`, `Arg`, `Char`, `Min`, `Max`, `Temp`, `Num`.
- A function parameter or local variable name shall end with `_`. But some files do not comply with this instruction. Keep them and write new code in them in the same consistent style.
- Each TypeScript or Bash script that is intended to be executed (not a library) shall contain the `main` function.
- Commented code is to be maintained. When making refactorings, try to refactor even commented code. But if the code would be incorrect if uncommented but would still require the refactoring, write a `todo-9` to refactor it in case it's uncommented.
- Create a Bash script for each supported action, such as running tests.
- Write comments only about unobvious intricacies. For example, explain dependencies of logic in different parts of the codebase. Consider using numbered comments or todos to link dependent parts of the codebase.
- When writing a comment (or a todo), insert it before relevant lines of code. Insert empty lines before the comment and after the last relevant line of code. When deleting a comment, delete the no longer needed empty lines, but be sure to not delete those needed for other comments.
- Review [numbered-comments.md](docs/numbered-comments.md). Feel free to write numbered comments or todos; just be sure to use IDs that do not exist in any file. Note that they can exist anywahere, such as within strings.
- The above document describes todos to be done by humans. Use the following similar syntax for todos to be done by the AI.

```solidity
// [ToDo-AI-202512308-1]
// Do this and that.
// [/ToDo-AI-202512308-1]

// todo-ai-0 Do this and that ASAP.
```

```bash
# A todo like the the above can be written in any file.
# Just use the comment syntax appropriate for the given file type.
```

- Prefer using only ASCII chars. For example, do not use `—`; use `--` instead. But if a file already contains some non-ASCII chars keep using them consistently.
- Some files do not comply with these instructions, and that's OK. Do not fix things that aren't broken. However, feel free to proactively recommend improving `.sol` files as you see fit. But given that some contracts have already been deployed, it's too late to improve them, but at least issue-comments should be written in those about what it would be nice to improve.
