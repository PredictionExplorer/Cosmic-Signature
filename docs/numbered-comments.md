### Numbered Comments

#### Introduction

We use numbered comments, for example:

```ts
// [Comment-202608222]
// My comment explaining stuff.
// [/Comment-202608222]
```

This notation resembles an XML element. In this example, `Comment-202608222` is the numbered comment tag, and `202608222` is its ID.

A numbered comment tag can link related locations in source code and other text files and can avoid duplicating the same comment text. To link related locations, use the same numbered comment tag at each location. To find all linked locations, globally search for that tag or just its ID.

If the text of a numbered comment is empty, we can use the self-closing form:

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

It means that the given comment is in some way relevant at the given location. It implies that it's clear in what way it's relevant. If the relationship is not clear, write a more descriptive reference-comment.

```ts
// Comment-202608222 relates and/or applies.
```

It means that the given comment applies in part and relates in another part.

#### Numbered ToDos

Similarly, numbered todos use paired opening and closing tags and the same reference forms:

```ts
// [ToDo-202512308-1]
// Do this and that.
// [/ToDo-202512308-1]

// ToDo-202512308-1 applies.

// ToDo-202512308-1 relates.

// ToDo-202512308-1 relates and/or applies.
```

Numbered ToDos do not use a self-closing form, such as `[ToDo-202608233-1/]`, because every ToDo must state what is to be done.

#### ToDo Priorities

The final hyphen-separated number, `1` in this example, is the ToDo priority. It is not part of the ID.

We use the following priorities:

- `0`: to do immediately.
- `1`: to do soon, before the next release.
- `2`: to do later, possibly after the next release.
- `3`: to do someday, low priority.
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

#### ID Namespace

An ID is a 9-digit numeric value in the format `YYYYMMDDN`, where `YYYYMMDD` is a date and `N` is a sequence digit from `1` through `9`.\
For example, if the date is September 15, 2025, and the sequence digit is 7, the ID will be 202509157.

Generate a new ID for each new logical numbered comment or numbered todo and for any other purpose that requires an ID. All generated IDs share one project-wide namespace, regardless of purpose. Each ID is assigned to exactly one logical item or purpose. All uses associated with that same item or purpose intentionally reuse the same ID. For a numbered item, the ID is also assigned to exactly one tag family: `Comment`, `ToDo`, or `ToDo-AI`.

#### Generating a New ID

Use the following logic to generate a new ID. If any of these steps fails, request my assistance and pause.

- Begin.

  - Load the previously saved ID from the workspace-root file `project-state/last-generated-id-number.txt` and parse it to extract the date and the sequence digit.

  - If the current local date is greater than the extracted one, replace the extracted date with the current local date and reset the sequence digit to 1.

  - Else if the sequence digit is less than 9, increment it.

  - Else, increment the date by 1 day and reset the sequence digit to 1.

  - Generate an ID from the date and sequence digit.
  
  - Save the new ID to the same file before using it.

- End.

#### Notes

- Most numbered comments and numbered todos are located in source code files, but some can be located in files of other types, such as `.md` and `.txt`. In file formats that support comments, use the appropriate comment syntax. For example:

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

- When changing the priority of a numbered todo, update the priority suffix in every occurrence of its tag.

- When deleting a numbered comment or a numbered todo, find and delete all its references.
