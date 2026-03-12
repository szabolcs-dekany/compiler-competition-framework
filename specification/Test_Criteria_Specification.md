# Test Criteria Specification
## Programming Language Evaluation Framework

**Total Test Cases: 48 | Maximum Points: 870**

---

## Scoring Legend

| Difficulty | Level | Base Points | Performance Bonus |
|------------|-------|-------------|-------------------|
| Easy | 1 | 10-15 pts | +20% if under threshold |
| Medium | 2 | 15-20 pts | +20% if under threshold |
| Hard | 3 | 20-35 pts | +20% if under threshold |

---

## Category 1: Basic Arithmetic Operations

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC001 | Integer Addition | Add two positive integers | 1 | 10 |
| TC002 | Integer Subtraction | Subtract larger from smaller (negative result) | 1 | 10 |
| TC003 | Integer Multiplication | Multiply two integers | 1 | 10 |
| TC004 | Integer Division | Integer division with truncation | 1 | 10 |
| TC005 | Modulo Operation | Compute remainder of division | 1 | 10 |
| TC006 | Floating Point Arithmetic | Add/multiply decimal numbers | 2 | 15 |
| TC007 | Operator Precedence | Expression 2+3*4 evaluates to 14 | 2 | 15 |
| TC008 | Parentheses Grouping | Expression (2+3)*4 evaluates to 20 | 2 | 15 |

**Category Points: 95**

---

## Category 2: Comparison and Logical Operations

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC009 | Equality Comparison | Compare equal and unequal values | 1 | 10 |
| TC010 | Relational Operators | Less than, greater than, etc. | 1 | 10 |
| TC011 | Logical AND | Evaluate conjunction with short-circuit | 2 | 15 |
| TC012 | Logical OR | Evaluate disjunction with short-circuit | 2 | 15 |
| TC013 | Logical NOT | Negate boolean values | 1 | 10 |
| TC014 | Compound Comparisons | Chained comparisons a < b && b < c | 2 | 15 |

**Category Points: 75**

---

## Category 3: Control Flow

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC015 | If-Else Conditional | Branch based on condition | 1 | 10 |
| TC016 | Nested Conditionals | If-else within if-else | 2 | 15 |
| TC017 | While Loop | Iterate while condition true | 1 | 10 |
| TC018 | For Loop | Iterate with counter | 1 | 10 |
| TC019 | Loop with Break | Exit loop prematurely | 2 | 15 |
| TC020 | Loop with Continue | Skip iteration and continue | 2 | 15 |
| TC021 | Switch/Match Statement | Multi-way branching | 2 | 20 |
| TC022 | Early Return | Return before function end | 2 | 15 |

**Category Points: 110**

---

## Category 4: Functions and Procedures

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC023 | Function Definition & Call | Define and invoke function | 1 | 10 |
| TC024 | Function Parameters | Pass arguments to function | 1 | 10 |
| TC025 | Function Return Value | Return computed result | 1 | 10 |
| TC026 | Multiple Return Values | Return tuple/multiple values | 3 | 25 |
| TC027 | Recursive Function | Function calls itself (factorial) | 2 | 20 |
| TC028 | Mutual Recursion | Two functions call each other | 3 | 25 |
| TC029 | Default Parameters | Call function with omitted args | 2 | 15 |
| TC030 | Higher-Order Functions | Pass function as argument | 3 | 30 |

**Category Points: 145**

---

## Category 5: Variables and Scope

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC031 | Variable Declaration | Declare variable with type | 1 | 10 |
| TC032 | Variable Assignment | Assign and reassign values | 1 | 10 |
| TC033 | Variable Scope (Local) | Access local variable | 1 | 10 |
| TC034 | Variable Shadowing | Inner scope shadows outer | 2 | 15 |
| TC035 | Global Variables | Access global from function | 2 | 15 |
| TC036 | Constants/Immutables | Attempt to modify constant | 2 | 15 |
| TC037 | Block Scope | Variables in { } blocks | 2 | 15 |

**Category Points: 90**

---

## Category 6: Data Types

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC038 | Integer Types | Different integer sizes (int8, int16, int32, int64) | 2 | 15 |
| TC039 | Floating Point Types | Float/double precision handling | 2 | 15 |
| TC040 | Boolean Type | True/false values and operations | 1 | 10 |
| TC041 | Character Type | Single character handling | 1 | 10 |
| TC042 | String Type | String literals and basic operations | 1 | 10 |
| TC043 | Type Casting | Convert between types (int to float, etc.) | 2 | 15 |
| TC044 | Type Inference | Omit type, let compiler infer | 2 | 20 |
| TC045 | Null/Nil Handling | Represent absence of value | 2 | 20 |

**Category Points: 115**

---

## Category 7: Data Structures

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC046 | Arrays (Fixed Size) | Create and access fixed-size array | 1 | 10 |
| TC047 | Dynamic Arrays/Lists | Grow and shrink list dynamically | 2 | 20 |
| TC048 | Array Index Out of Bounds | Access invalid index (error handling) | 2 | 15 |
| TC049 | Multi-dimensional Arrays | 2D or 3D array access | 2 | 20 |
| TC050 | Structs/Records | Define custom data type with fields | 2 | 15 |
| TC051 | Nested Structs | Struct within struct access | 2 | 20 |
| TC052 | Maps/Dictionaries | Key-value pair storage and lookup | 2 | 20 |
| TC053 | Sets | Unique element collections | 2 | 15 |

**Category Points: 135**

---

## Category 8: String Operations

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC054 | String Concatenation | Join two or more strings | 1 | 10 |
| TC055 | String Length | Get length of string | 1 | 10 |
| TC056 | String Indexing | Access character by position | 1 | 10 |
| TC057 | String Comparison | Compare two strings (equality, ordering) | 2 | 15 |
| TC058 | Substring Extraction | Extract portion of string | 2 | 15 |
| TC059 | String Contains | Find substring within string | 2 | 15 |
| TC060 | String Split | Split by delimiter into array | 2 | 15 |
| TC061 | String Case Conversion | To upper/lower case | 2 | 15 |

**Category Points: 105**

---

## Category 9: Memory Management

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC062 | Stack Allocation | Local variables on stack | 2 | 15 |
| TC063 | Heap Allocation | Dynamic memory allocation (malloc/new) | 2 | 20 |
| TC064 | Memory Deallocation | Free allocated memory | 2 | 20 |
| TC065 | Pointer/Reference Types | Access data via pointer/reference | 2 | 20 |
| TC066 | Null Pointer Dereference | Handle dereference null gracefully | 2 | 15 |
| TC067 | Memory Safety | Use after free detection/prevention | 3 | 25 |
| TC068 | Garbage Collection | Automatic memory reclamation | 3 | 30 |

**Category Points: 145**

---

## Category 10: Input/Output Operations

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC069 | Print to Stdout | Output string/number to console | 1 | 10 |
| TC070 | Read from Stdin | Accept user input | 2 | 15 |
| TC071 | Command Line Arguments | Access argv parameters | 2 | 15 |
| TC072 | File Reading | Read contents from file | 2 | 20 |
| TC073 | File Writing | Write contents to file | 2 | 20 |
| TC074 | Formatted Output | Printf-style formatting | 2 | 15 |

**Category Points: 95**

---

## Category 11: Error Handling

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC075 | Division by Zero | Handle divide by zero gracefully | 2 | 15 |
| TC076 | Integer Overflow | Exceed integer range detection | 2 | 15 |
| TC077 | Stack Overflow | Infinite recursion detection/handling | 2 | 20 |
| TC078 | Try-Catch Exceptions | Catch runtime errors | 3 | 25 |
| TC079 | Custom Exceptions | Throw user-defined errors | 3 | 25 |
| TC080 | Error Propagation | Bubble errors up call stack | 3 | 25 |

**Category Points: 125**

---

## Category 12: Bitwise Operations

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC081 | Bitwise AND | `a & b` operation | 2 | 15 |
| TC082 | Bitwise OR | `a \| b` operation | 2 | 15 |
| TC083 | Bitwise XOR | `a ^ b` operation | 2 | 15 |
| TC084 | Bitwise NOT | `~a` operation (complement) | 2 | 15 |
| TC085 | Left Shift | `a << n` operation | 2 | 15 |
| TC086 | Right Shift | `a >> n` operation | 2 | 15 |

**Category Points: 90**

---

## Category 13: Advanced Features

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC087 | Closures | Function captures environment variables | 3 | 30 |
| TC088 | Anonymous Functions | Inline lambda definition | 3 | 25 |
| TC089 | Generics/Templates | Type-parameterized functions/types | 3 | 30 |
| TC090 | Pattern Matching | Destructure and match patterns | 3 | 30 |
| TC091 | Operator Overloading | Define custom operator behavior | 3 | 30 |
| TC092 | Method Chaining | Chain method calls fluently | 2 | 20 |

**Category Points: 165**

---

## Category 14: Concurrency (Optional/Bonus)

| ID | Test Name | Description | Difficulty | Points |
|----|-----------|-------------|------------|--------|
| TC093 | Thread Creation | Spawn new thread of execution | 3 | 30 |
| TC094 | Mutex/Lock Synchronization | Mutual exclusion primitives | 3 | 30 |
| TC095 | Atomic Operations | Thread-safe atomic counters | 3 | 30 |
| TC096 | Channel Communication | Pass data between threads | 3 | 35 |

**Category Points: 125 (Bonus)**

---

## Summary Statistics

| Category | Tests | Points |
|----------|-------|--------|
| 1. Basic Arithmetic Operations | 8 | 95 |
| 2. Comparison and Logical Operations | 6 | 75 |
| 3. Control Flow | 8 | 110 |
| 4. Functions and Procedures | 8 | 145 |
| 5. Variables and Scope | 7 | 90 |
| 6. Data Types | 8 | 115 |
| 7. Data Structures | 8 | 135 |
| 8. String Operations | 8 | 105 |
| 9. Memory Management | 7 | 145 |
| 10. Input/Output Operations | 6 | 95 |
| 11. Error Handling | 6 | 125 |
| 12. Bitwise Operations | 6 | 90 |
| 13. Advanced Features | 6 | 165 |
| 14. Concurrency (Optional) | 4 | 125 |
| **Total (Required)** | **48** | **870** |
| **Total (with Bonus)** | **52** | **995** |

---

## Test Case YAML Template

```yaml
test_cases:
  - id: "TC001"
    category: "arithmetic"
    name: "Integer Addition"
    description: "Add two positive integers and print result"
    difficulty: 1
    source_file: "TC001_add_integers.lang"
    expected_stdout: "42"
    expected_exit_code: 0
    args: []
    stdin: null
    timeout_ms: 5000
    max_memory_mb: 256
    points: 10
    performance_bonus: true
    performance_threshold_ms: 100
```

---

## Difficulty Distribution

| Difficulty | Count | Percentage |
|------------|-------|------------|
| Easy (1) | 18 | 37.5% |
| Medium (2) | 22 | 45.8% |
| Hard (3) | 8 | 16.7% |

---

## Essential 40 Tests (Minimum Viable Competition)

If time constraints require a reduced test suite, prioritize these 40 essential tests:

| Category | Essential Test IDs |
|----------|-------------------|
| Arithmetic | TC001, TC002, TC003, TC004, TC005, TC006, TC007, TC008 |
| Comparison | TC009, TC010, TC011, TC012 |
| Control Flow | TC015, TC017, TC018, TC019 |
| Functions | TC023, TC024, TC025, TC027 |
| Variables | TC031, TC032, TC033 |
| Data Types | TC040, TC042, TC045 |
| Data Structures | TC046, TC050 |
| Strings | TC054, TC055 |
| I/O | TC069, TC071 |
| Errors | TC075, TC076 |
| Bitwise | TC081, TC082 |
| Memory | TC062, TC063, TC065 |
