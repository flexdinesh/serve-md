package web

// Process sampling adapted from px0, licensed under MIT. See vendor/PX0-LICENSE.txt.

import (
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type processMetrics struct {
	RSSBytes   uint64  `json:"rssBytes"`
	CPUUsage   float64 `json:"cpuUsage"`
	Goroutines int     `json:"goroutines"`
	Supported  bool    `json:"supported"`
}

type metricsCollector struct {
	mu          sync.Mutex
	lastSample  time.Time
	lastCPUTime time.Duration
	lastUsage   float64
}

func (c *metricsCollector) sample() processMetrics {
	rss, rssErr := readProcessRSS()
	cpu, cpuErr := c.sampleCPU()
	return processMetrics{
		RSSBytes:   rss,
		CPUUsage:   cpu,
		Goroutines: runtime.NumGoroutine(),
		Supported:  rssErr == nil && cpuErr == nil,
	}
}

func readProcessRSS() (uint64, error) {
	data, err := os.ReadFile("/proc/self/statm")
	if err != nil {
		return 0, err
	}
	fields := strings.Fields(string(data))
	if len(fields) < 2 {
		return 0, fmt.Errorf("resident pages unavailable")
	}
	pages, err := strconv.ParseUint(fields[1], 10, 64)
	if err != nil {
		return 0, err
	}
	return pages * uint64(os.Getpagesize()), nil
}

func (c *metricsCollector) sampleCPU() (float64, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	cpuTime, err := readProcessCPUTime()
	if err != nil {
		return c.lastUsage, err
	}
	if c.lastSample.IsZero() {
		c.lastSample = now
		c.lastCPUTime = cpuTime
		return 0, nil
	}

	wallDelta := now.Sub(c.lastSample)
	if wallDelta < 200*time.Millisecond {
		return c.lastUsage, nil
	}
	cpuDelta := cpuTime - c.lastCPUTime
	usage := float64(cpuDelta) / float64(wallDelta) * 100
	if usage < 0 {
		usage = 0
	}
	c.lastSample = now
	c.lastCPUTime = cpuTime
	c.lastUsage = usage
	return usage, nil
}

func readProcessCPUTime() (time.Duration, error) {
	data, err := os.ReadFile("/proc/self/stat")
	if err != nil {
		return 0, err
	}
	endName := strings.LastIndexByte(string(data), ')')
	if endName < 0 || len(data) <= endName+2 {
		return 0, fmt.Errorf("process stat unavailable")
	}
	fields := strings.Fields(string(data[endName+2:]))
	if len(fields) < 13 {
		return 0, fmt.Errorf("process CPU fields unavailable")
	}
	userTicks, userErr := strconv.ParseInt(fields[11], 10, 64)
	systemTicks, systemErr := strconv.ParseInt(fields[12], 10, 64)
	if userErr != nil {
		return 0, userErr
	}
	if systemErr != nil {
		return 0, systemErr
	}
	const clockTicksPerSecond = 100
	return time.Duration(userTicks+systemTicks) * time.Second / clockTicksPerSecond, nil
}
