### Numbered Comments

#### Introduction

We use numbered comments, for example:

```ts
// [Comment-202608222]
// My comment explaining stuff.
// [/Comment-202608222]
```

This notation resembles an XML element. It consists of paired opening and closing tags and text between them. In this example, `Comment-202608222` is the numbered comment tag, and `202608222` is its ID. The tag is treated as case insensitive.

A numbered comment with no text can be formatted as a self-closing tag, for example:

```ts
// [Comment-202512307/]
```

Each numbered comment has exactly one XML-element-like defining occurrence. All other occurrences of the numbered comment's tag are references.

A numbered comment tag can link related locations in source code and other text files and can avoid duplicating the same comment text. To link related locations, use the same numbered comment tag at each location. To find all linked locations, globally search for that tag or just its ID.

#### Frequently Used Phrases

The following are examples of numbered comment references.

```ts
// Comment-202608222 applies.
```

It means a copy of the same numbered comment. In other words, the same numbered comment is inherited at the given location.

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

We collectively refer to numbered comments and numbered todos, whether human or AI, as numbered items.

#### ID Namespace

An ID is a 9-digit numeric value in the format `YYYYMMDDN`, where `YYYYMMDD` is a date and `N` is a sequence digit from `1` through `9`.\
For example, if the date is September 15, 2025, and the sequence digit is 7, the ID will be 202509157.

Generate a new ID for each new numbered item or for any other purpose that requires one. All generated IDs share one project-wide namespace, regardless of purpose. Each ID is assigned to exactly one logical item or purpose. All uses associated with that same item or purpose intentionally reuse the same ID. For a numbered item, the ID is also assigned to exactly one tag family: `Comment`, `ToDo`, or `ToDo-AI`.

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

#### Instructions

- Before making any change these instructions cover, re-evaluate all these instructions against the current state.

- Before changing any part of a numbered item's tag or deleting the item or its defining tags, if its text states that it is referenced outside the workspace, ask for permission to proceed.

- When changing any part of a numbered item's tag, update all occurrences of the tag.

- When deleting a numbered item or only its defining tags, if any of its references exist, delete them as well, but first ask for permission to proceed.

- When deleting a numbered item's all existing references, ask for permission to delete the item's defining tags (while retaining its text). Note that the item can have either a pair of tags or a single self-closing tag.

- When deleting one or more files:
  - If a numbered item exists in a file to be deleted:
    - If its references exist in files not to be deleted:
      - If some of the references state that the given numbered item `applies`, ask for my permission to swap one of those references with the given numbered item. In addition, if there are multiple references like that, ask me to choose one of them.
      - Else, act as when deleting the numbered item.
    - Else, act as when deleting the numbered item.
  - If a numbered item exists in a file not to be deleted and its references exist in files to be deleted, act as when deleting the references.

#### Notes

- Most numbered items are located in source code files, but some can be located in files of other types, such as `.md` or `.txt`. In file formats that support comments, use the appropriate comment syntax. For example:

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
