### Numbered Comments

#### Introduction

When reviewing project files, you are going to come across comments like this:

```ts
// [Comment-202608222]
// My comment explaining stuff.
// [/Comment-202608222]
```

The purpose of such an XML-like notation is to link related locations within source code and other text files with each other, as well as to avoid writing the same comment in multiple locations. To link different locations in text with each other, we mention a comment with the same number in all those locations. To find all linked locations, perform global search for the given number.

When we need a comment/label to reference in other comments and don't need to write any text in it, we can use the self-closing form:

```ts
// [Comment-202512307/]
```

#### Frequently Used Phrases

```ts
// Comment-202608222 applies.
```

It means that the same text would otherwise need to be written at the given location as well.

```ts
// Comment-202608222 relates.
```

It means that the given comment is in some way relevant at the given location. It implies that it's clear in what way it's relevant. If the relationship is not clear, write a more descriptive reference comment.

```ts
// Comment-202608222 relates and/or applies.
```

It means that the given comment applies in part and relates in another part.

#### Numbered ToDos

Similarly, ToDos can be written in the same format:

```ts
// [ToDo-202512308-1]
// Do this and that.
// [/ToDo-202512308-1]

// ToDo-202512308-1 applies.

// ToDo-202512308-1 relates.

// ToDo-202512308-1 relates and/or applies.
```

Note that the todo self-closing form such as `[ToDo-202608233/]` is not used because it makes no sense for todo description to be empty.

#### ToDo Priorities

The final hyphen-separated number, `1` in this example, is the ToDo priority. It is not part of the unique ID.\
We recommend using the following priorities:

- `0`: to do immediately.
- `1`: to do soon, before the next release.
- `2`: to do later, possibly after the next release.
- `3`: to do some day, low priority.
- `4`: rarely used for a not-any-time-soon todo, such as doing something about a timestamp overflow in 100 years.
- `9`: a todo in (1) commented code; (2) legacy docs that are no longer correct. These todos are to be done if we decide to uncomment the code or revive the docs.

We use the same priorities for non-numbered todos as well, for example:

```ts
// ToDo-0 Do this and that ASAP.
```

#### AI ToDos

The `ToDo` forms above are human todos. Use `ToDo-AI` for todos to be done by an artificial intelligence agent. The same priorities and reference forms apply.

```ts
// [ToDo-AI-202608224-1]
// Do this and that.
// [/ToDo-AI-202608224-1]

// ToDo-AI-202608224-1 applies.

// ToDo-AI-202608224-1 relates.

// ToDo-AI-202608224-1 relates and/or applies.

// ToDo-AI-0 Do this and that ASAP.
```

Use the comment syntax appropriate for the file type. For example:

```md
<!--
[ToDo-AI-202608225-2]
Do this and that.
[/ToDo-AI-202608225-2]
-->

<!-- ToDo-AI-202608225-2 applies. -->

<!-- ToDo-AI-202608225-2 relates. -->

<!-- ToDo-AI-202608225-2 relates and/or applies. -->

<!-- ToDo-AI-3 Do this and that. -->
```

#### Unique ID Namespace

A unique ID is the 9-digit numeric value `YYYYMMDDN`, where `YYYYMMDD` is a date and `N` is a sequence digit from `1` through `9`. It identifies one logical item or purpose and is unique across all such uses in the workspace. Numbered comments, human todos, AI todos, and other uses of these IDs share the same namespace. Declarations and references to the same logical item intentionally reuse its ID. A todo priority suffix, such as `-1`, is not part of the unique ID.

#### Generating a New Unique ID

Use the following logic to generate a unique ID for a new numbered comment or numbered todo (or for any other purpose).

- Generating the first unique ID. Do this if you have not yet saved the last generated unique ID.

  - Initialize a date variable from the current local date.

  - Loop.

    - Generate a number from the date in the format `YYYYMMDD`.\
      For example, on December 31, 2026, the number will be 20261231.

    - Perform a global search across workspace files for the generated number, not whole word.

    - If not found, break the loop.

    - Increment the date by 1 day.\
      For example, after December 31, 2026, the next date will be January 1, 2027.

  - End of loop.

  - Generate a unique ID from the found date using format `YYYYMMDDN`, where `N` is a sequence digit to be initialized with 1.\
    For example, if the found date is January 2, 2027, the unique ID will be 202701021.

  - Save the generated unique ID to some kind of storage. Ideally, the storage should be shared by all AI agent sessions. Even better, it should live on a server and be usable by all team members.

- End.

- Generating a subsequent (not the first) unique ID. Do this if you have previously saved the last generated unique ID.

  - Load the previously saved unique ID and parse it to extract the date and the sequence digit.

  - If the current local date is greater than the extracted one, replace the extracted date with the current local date and reset the sequence digit to 0.

  - Loop.

    - If the sequence digit is less than 9, increment it.

    - Else, increment the date by 1 day and reset the sequence digit to 1.

    - Generate a unique ID from the date and sequence digit using the same format.

    - Perform a global search across workspace files for the generated unique ID, not whole word.

    - If not found, break the loop.

  - End of loop.

  - Save the generated unique ID to the same storage.

- End.

#### Notes

- Most numbered comments and todos are located in source code files, but some can be located in files of other types, such as `.md` and `.txt`.
