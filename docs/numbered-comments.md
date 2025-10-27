### Numbered Comments

#### Introduction

When reviewing project files, you are going to come across comments like this:
```ts
// [Comment-202510229]
// My comment explaining stuff.
// [/Comment-202510229]
```
The purpose of such an XML-like notation is to link related locations within source code or whatever text files with each other, as well as to avoid writing the same comment in multiple locations. To link different locations in text with each other, we mention a comment with the same number in all those locations. To find all linked locations, perform global search for the given number.

When we need a comment/label to reference in other comments and don't need to write any text in it, we can write it this XML-like way:
```ts
// [Comment-202511223/]
```

#### Frequently Used Phrases

```ts
// Comment-202510229 applies.
```
It means that the same text would otherwise need to be written at the given location as well.

```ts
// Comment-202510229 relates.
```
It means that the given comment is in some way relevant at the given location. It implies that it's clear in what way it's relevant. If it's not very clear one should write a more verbose comment.

#### Numbered ToDos

Similarly, ToDos can be written in the same format:
```ts
// [ToDo-202510231-1]
// Do this and that.
// [/ToDo-202510231-1]
```
```ts
// ToDo-202510231-1 applies.
```
```ts
// ToDo-202510231-1 relates.
```

The last digit, 1 in this case, is a ToDo priority.
We recommend using the following priorities:
- 0: to do immediately.
- 1: to do very soon, before the next release.
- 2: to do soon after the next release.
- 3: to do some day, low priority.
- 4: rarely used for a not-any-time-soon to do, such as to do something about a timestamp overflow in 100 years.
- 9: a todo in commented code that would need to be done if the code is ever uncommented.

We use the same priorities for non-numbeted todos as well:
```ts
// ToDo-0 Do this and that ASAP.
```
