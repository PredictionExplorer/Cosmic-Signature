### Numbered Comments

#### Introduction

When reviewing project files, you are going to come across comments like this:

```ts
// [Comment-202512307]
// My comment explaining stuff.
// [/Comment-202512307]
```

The purpose of such an XML-like notation is to link related locations within source code or whatever text files with each other, as well as to avoid writing the same comment in multiple locations. To link different locations in text with each other, we mention a comment with the same number in all those locations. To find all linked locations, perform global search for the given number.

When we need a comment/label to reference in other comments and don't need to write any text in it, we can write it this XML-like way:

```ts
// [Comment-202512307/]
```

#### Frequently Used Phrases

```ts
// Comment-202512307 applies.
```

It means that the same text would otherwise need to be written at the given location as well.

```ts
// Comment-202512307 relates.
```

It means that the given comment is in some way relevant at the given location. It implies that it's clear in what way it's relevant. If it's not very clear one should write a more verbose comment.

```ts
// Comment-202512307 relates and/or applies.
```

It means that the given comment applies in part and relates in another part.

#### Numbered ToDos

Similarly, ToDos can be written in the same format:

```ts
// [ToDo-202512308-1]
// Do this and that.
// [/ToDo-202512308-1]
```

```ts
// ToDo-202512308-1 applies.
```

```ts
// ToDo-202512308-1 relates.
```

```ts
// ToDo-202512308-1 relates and/or applies.
```

#### ToDo Priorities

The last digit, `1` in this case, is a ToDo priority.
We recommend using the following priorities:

- `0` : to do immediately.
- `1` : to do soon, before the next release.
- `2` : to do later, possibly after the next release.
- `3` : to do some day, low priority.
- `4` : rarely used for a not-any-time-soon todo, such as do something about a timestamp overflow in 100 years.
- `9` : a todo in (1) commented code; (2) legacy docs that are no longer correct. These todos are to be done if we decide to uncomment the code or revive the docs.

We use the same priorities for non-numbered todos as well, for example:

```ts
// ToDo-0 Do this and that ASAP.
```

#### AI ToDos

The above todo syntax is used for human todos. Use the following similar syntax for todos to be done by an artificial intelligence agent.

```ts
// [ToDo-AI-202512308-1]
// Do this and that.
// [/ToDo-AI-202512308-1]

// ToDo-AI-0 Do this and that ASAP.
```

```bash
# [ToDo-AI-202512308-1]
# Do this and that.
# [/ToDo-AI-202512308-1]

# ToDo-AI-0 Do this and that ASAP.
```

#### Notes

- Most numbered comments and todos are located in source code files, but some can be located in files of other types, such as `md` and `txt`.
