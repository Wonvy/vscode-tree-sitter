#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =============================================================================
#  连续块注释（Block-like comments）
#  这些注释紧贴在模块文档前，用于测试“向上吸附注释”的逻辑。
# =============================================================================

"""
complex_case.py
===============

A stress-test module for outline providers and comment extractors.

This module intentionally contains:
- nested functions (multi-level)
- async defs, generator defs, decorated defs
- classes with inner classes, properties, magic methods
- various docstring styles: Google, NumPy, reST
- lots of leading comments and tricky parameter signatures

.. note::
   Use this file to verify hierarchical extraction & comment binding.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Generator, Iterable, Optional, Union

__all__ = ["top_level", "top_level_async", "top_level_gen", "Factory", "Advanced", "callbacks"]

# ---- 顶级 lambda（带行注释） -------------------------------------------------
identity: Callable[[Any], Any] = lambda x: x  # 单行注释：顶级 lambda


# ---- 装饰器 ------------------------------------------------------------------
def trace(prefix: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """reST style

    :param prefix: message prefix
    :returns: decorator that logs before call
    """
    def deco(fn: Callable[..., Any]) -> Callable[..., Any]:
        def wrapper(*args, **kwargs):
            print(f"{prefix}{fn.__name__} args={args}, kwargs={kwargs}")
            return fn(*args, **kwargs)
        return wrapper
    return deco


# ---- 顶级函数（Google 风格文档）----------------------------------------------
@trace(prefix="[TRACE] ")
def top_level(a: int, b: int = 2, /, c: str = "x", *, d: float = 1.5, **extras: Any) -> int:
    """Add two numbers with extra options.

    Args:
        a (int): first number (positional-only).
        b (int, optional): second number (positional-only). Defaults to 2.
        c (str, optional): keyword-or-positional. Defaults to "x".
        d (float, optional): keyword-only. Defaults to 1.5.
        **extras: arbitrary options.

    Returns:
        int: a + b
    """
    # 顶层函数中的局部 lambda
    local_mul = lambda x, y: x * y
    _ = local_mul(a, b)

    # 第一层嵌套
    def level1(p: int) -> int:
        """NumPy style
        Parameters
        ----------
        p : int
            value to add
        Returns
        -------
        int
            result
        """
        # 第二层嵌套
        def level2(q: int) -> int:
            """reST style
            :param q: value to add
            :return: sum up to q
            """
            # 第三层嵌套
            def level3(r: int) -> int:
                """single line docstring"""
                return r + 1

            return level3(q) + 1

        return level2(p) + 1

    return a + b


# ---- 顶级异步函数（reST 风格文档）--------------------------------------------
async def top_level_async(x: int, y: int) -> int:
    """Compute asynchronously.

    :param x: first number
    :param y: second number
    :returns: sum
    """
    # 注释：这里可以 await 其他协程
    return x + y


# ---- 顶级生成器（NumPy 风格文档）---------------------------------------------
def top_level_gen(n: int) -> Generator[int, None, None]:
    """Yield numbers.

    Parameters
    ----------
    n : int
        count
    Yields
    ------
    int
        numbers from 0..n-1
    """
    for i in range(n):
        yield i


# ---- 工厂函数：返回函数（多级嵌套 + 注释）------------------------------------
def Factory(name: str) -> Callable[[int], str]:
    """Create a printer closure.

    Args:
        name: label name

    Returns
    -------
    Callable[[int], str]
        a closure
    """
    # 局部注释：测试向上吸附
    def printer(v: int) -> str:
        """printer doc"""
        def format_inner(k: int) -> str:
            """inner formatter"""
            return f"{name}:{k}"
        return format_inner(v)
    return printer


# ---- 类：包含各种方法、属性、内嵌类、异步、生成器、上下文管理 -------------------
class Advanced:
    """An advanced class to test outline extraction.

    Attributes
    ----------
    factor : int
        multiply factor
    """

    # 类属性 + 注释
    factor: int = 3  # type: int

    # 类字段上的 lambda
    transform: Callable[[int], int] = staticmethod(lambda x: x + 1)

    # ---- 构造/魔术方法 -------------------------------------------------------
    def __new__(cls, *args, **kwargs):
        """__new__ doc"""
        return super().__new__(cls)

    def __init__(self, base: int = 10) -> None:
        """__init__ doc (Google style)

        Args:
            base: base value
        """
        self._base = base

    def __repr__(self) -> str:
        """repr doc"""
        return f"Advanced(base={self._base!r})"

    def __call__(self, v: int) -> int:
        """call doc"""
        return self._base + v

    # ---- 上下文管理 ----------------------------------------------------------
    def __enter__(self) -> "Advanced":
        """enter doc"""
        return self

    def __exit__(self, exc_type, exc, tb) -> Optional[bool]:
        """exit doc"""
        return None

    # ---- 实例方法（含本地函数与 lambda）--------------------------------------
    def compute(self, x: int, /, y: int = 1, *, z: int = 0) -> int:
        """Compute with local helpers.

        Parameters
        ----------
        x : int
        y : int, optional
        z : int, optional
        """
        helper = lambda a, b: a + b  # 局部 lambda

        def local_scale(v: int) -> int:
            """scale inner"""
            return v * self.factor

        return local_scale(helper(x, y)) + z

    # ---- classmethod / staticmethod / async / generator ---------------------
    @classmethod
    def from_iterable(cls, it: Iterable[int]) -> "Advanced":
        """classmethod doc"""
        inst = cls(sum(it))
        return inst

    @staticmethod
    def clamp(v: int, lo: int = 0, hi: int = 100) -> int:
        """staticmethod doc"""
        return max(lo, min(hi, v))
