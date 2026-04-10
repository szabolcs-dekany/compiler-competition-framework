package main

import (
	"fmt"
	"os"
	"strconv"
)

func main() {
	// os.Args[1] is the first parameter
	if len(os.Args) < 2 {
		fmt.Println("Usage: ./check_number <number>")
		os.Exit(1)
	}

	// Convert the parameter (string) to an integer
	n, err := strconv.Atoi(os.Args[1])
	if err != nil {
		fmt.Printf("Error: '%s' is not a valid integer\n", os.Args[1])
		os.Exit(1)
	}

	// Check if the number is positive, negative, or zero
	if n > 0 {
		fmt.Println("positive")
	} else if n < 0 {
		fmt.Println("negative")
	} else {
		fmt.Println("zero")
	}
}