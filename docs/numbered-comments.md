### Numbered Comments

#### Introduction

We use numbered comments, for example:

```ts
// [Comment-202608222]
// My comment explaining stuff.
// [/Comment-202608222]
```

This notation resembles an XML element. It consists of paired opening and closing tags and text between them. In this example, `Comment-202608222` is the numbered comment tag, and `202608222` is its ID. The tag is treated as case-insensitive.

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

The same defining-occurrence and reference rules apply to numbered todos. Numbered todos use paired opening and closing tags and the same reference forms:

```ts
// [ToDo-202512308-1]
// Do this and that.
// [/ToDo-202512308-1]

// ToDo-202512308-1 applies.

// ToDo-202512308-1 relates.

// ToDo-202512308-1 relates and/or applies.
```

Numbered ToDos rarely use a self-closing form, because a typical ToDo must state what is to be done.

```ts
// [ToDo-202608233-1/]
```

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

- Before editing, determine the complete planned change set. Starting with the requested changes, repeatedly apply these instructions to the projected state and add each consequential change once until no new consequence appears.

- Ask all currently determinable permission and choice questions before editing. If an answer changes the projected state, re-evaluate it. Modify files only after all required questions have been resolved, then apply the approved changes in one batch.

- Before changing any part of a numbered item's tag, deleting its defining occurrence, or deleting only its defining tag or tags, ask for permission if the item's text states that it is referenced outside the workspace.

- If the projected change modifies any part of a numbered item's tag, update every occurrence of that tag.

- If the projected change would delete a numbered item's defining occurrence or only its defining tag or tags while leaving any references, include deletion of all those references in the planned change set, but first ask for permission.

- If the projected change would delete all references to a numbered item while its defining occurrence would otherwise remain, ask for permission to delete its defining tag or tags too. Retain any text between paired tags. Deleting a self-closing defining tag deletes the empty numbered item.

- When planning to delete one or more files:

  - For each numbered item whose defining occurrence is in a file to be deleted, if one or more references in files to be retained use the exact `applies` form, ask for permission to swap the defining occurrence with one such reference. Swapping means that the selected retained location becomes the defining occurrence and the old defining location becomes an `applies` reference. If multiple eligible references exist, ask me which one to use.

  - After incorporating any approved swaps into the projected state, treat every numbered-item defining occurrence and reference in a file to be deleted as planned for deletion, and apply all other instructions to those planned deletions.

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
