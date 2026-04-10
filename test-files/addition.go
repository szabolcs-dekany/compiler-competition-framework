package main

import (
	"fmt"
	"os"
	"strconv"
)

func main() {
	// os.Args[0] is the program name, os.Args[1] is the first parameter
	if len(os.Args) < 3 {
		fmt.Println("Usage: ./program <num1> <num2>")
		os.Exit(1)
	}

	// Convert the first parameter (string) to an integer
	a, err1 := strconv.Atoi(os.Args[1])
	if err1 != nil {
		fmt.Printf("Error: '%s' is not a valid integer\n", os.Args[1])
		os.Exit(1)
	}

	// Convert the second parameter (string) to an integer
	b, err2 := strconv.Atoi(os.Args[2])
	if err2 != nil {
		fmt.Printf("Error: '%s' is not a valid integer\n", os.Args[2])
		os.Exit(1)
	}

	// Calculate and print result
	result := a + b
	fmt.Println(result)
}